import React from 'react';
import { speechService } from '../services/speech.service';

/** Sample rate the recogniser expects (see resources/python/speech_bridge.py). */
const TARGET_SAMPLE_RATE = 16000;
/** Samples per ScriptProcessor callback; 4096 ≈ 85 ms at 48 kHz. */
const PROCESSOR_BUFFER_SIZE = 4096;

export type DictationState = 'idle' | 'starting' | 'listening' | 'stopping';

interface UseDictationOptions {
  /** Called with each finished phrase. */
  onTranscript: (text: string) => void;
  /** Called with the in-progress hypothesis ('' once a phrase is finished). */
  onPartial?: (text: string) => void;
  /** Called with a human-readable message when dictation fails. */
  onError?: (message: string) => void;
}

interface AudioCapture {
  stream: MediaStream;
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
}

/** Linear-interpolation downsample to the recogniser's sample rate. */
const downsample = (
  input: Float32Array,
  inputRate: number,
  outputRate: number,
): Float32Array => {
  if (inputRate === outputRate) return input;
  const ratio = inputRate / outputRate;
  const outputLength = Math.floor(input.length / ratio);
  const output = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const index = Math.floor(position);
    const next = Math.min(index + 1, input.length - 1);
    const fraction = position - index;
    output[i] = input[index] * (1 - fraction) + input[next] * fraction;
  }
  return output;
};

const floatToPcm16 = (input: Float32Array): ArrayBuffer => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, input[i]));
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return output.buffer;
};

const describeMicError = (error: unknown): string => {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Microphone access was denied.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No microphone was found.';
    case 'NotReadableError':
      return 'The microphone is in use by another application.';
    default:
      return error instanceof Error
        ? error.message
        : 'Unable to access the microphone.';
  }
};

/**
 * Offline dictation: captures the microphone, streams 16 kHz PCM to the main
 * process over IPC and surfaces the recogniser's phrases.
 */
export const useDictation = ({
  onTranscript,
  onPartial,
  onError,
}: UseDictationOptions) => {
  const [state, setState] = React.useState<DictationState>('idle');
  const captureRef = React.useRef<AudioCapture | null>(null);
  const unsubscribeRef = React.useRef<(() => void) | null>(null);
  const stateRef = React.useRef<DictationState>('idle');

  const onTranscriptRef = React.useRef(onTranscript);
  const onPartialRef = React.useRef(onPartial);
  const onErrorRef = React.useRef(onError);
  onTranscriptRef.current = onTranscript;
  onPartialRef.current = onPartial;
  onErrorRef.current = onError;

  const updateState = React.useCallback((next: DictationState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const releaseCapture = React.useCallback(() => {
    const capture = captureRef.current;
    captureRef.current = null;
    if (!capture) return;
    capture.processor.onaudioprocess = null;
    try {
      capture.source.disconnect();
      capture.processor.disconnect();
    } catch {
      // Nodes may already be disconnected.
    }
    capture.stream.getTracks().forEach((track) => track.stop());
    capture.context.close().catch(() => undefined);
  }, []);

  const unsubscribe = React.useCallback(() => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
  }, []);

  const stop = React.useCallback(async () => {
    if (stateRef.current === 'idle' || stateRef.current === 'stopping') return;
    updateState('stopping');
    releaseCapture();
    onPartialRef.current?.('');
    try {
      // Final phrases arrive as session events while this resolves.
      await speechService.stop();
    } finally {
      unsubscribe();
      updateState('idle');
    }
  }, [releaseCapture, unsubscribe, updateState]);

  const start = React.useCallback(async () => {
    if (stateRef.current !== 'idle') return;
    updateState('starting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      updateState('idle');
      onErrorRef.current?.(describeMicError(error));
      return;
    }

    unsubscribe();
    unsubscribeRef.current = speechService.onSessionEvent((event) => {
      switch (event.type) {
        case 'result':
          onPartialRef.current?.('');
          onTranscriptRef.current(event.text);
          break;
        case 'partial':
          onPartialRef.current?.(event.text);
          break;
        case 'error':
          onErrorRef.current?.(event.message);
          break;
        case 'ended':
          // The recogniser went away (normal stop or crash); drop the mic.
          releaseCapture();
          unsubscribe();
          onPartialRef.current?.('');
          updateState('idle');
          break;
        default:
          break;
      }
    });

    try {
      await speechService.start();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      unsubscribe();
      updateState('idle');
      onErrorRef.current?.(
        error instanceof Error ? error.message : 'Unable to start dictation.',
      );
      return;
    }

    // ScriptProcessorNode is deprecated but needs no separate worklet file,
    // which keeps the bundle untouched; the work per callback is tiny.
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(
      PROCESSOR_BUFFER_SIZE,
      1,
      1,
    );
    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const resampled = downsample(
        input,
        context.sampleRate,
        TARGET_SAMPLE_RATE,
      );
      speechService.sendAudio(floatToPcm16(resampled));
    };
    source.connect(processor);
    // Chromium only runs the processor when it is wired to the destination;
    // its output stays silent because we never write to the output buffer.
    processor.connect(context.destination);

    captureRef.current = { stream, context, source, processor };
    updateState('listening');
  }, [releaseCapture, unsubscribe, updateState]);

  const toggle = React.useCallback(() => {
    if (stateRef.current === 'idle') start().catch(() => undefined);
    else if (stateRef.current === 'listening') stop().catch(() => undefined);
  }, [start, stop]);

  // Tear everything down on unmount.
  React.useEffect(() => {
    return () => {
      releaseCapture();
      unsubscribe();
      if (stateRef.current !== 'idle') {
        speechService.stop().catch(() => undefined);
      }
    };
  }, [releaseCapture, unsubscribe]);

  return {
    state,
    isListening: state === 'listening',
    isBusy: state === 'starting' || state === 'stopping',
    start,
    stop,
    toggle,
  };
};
