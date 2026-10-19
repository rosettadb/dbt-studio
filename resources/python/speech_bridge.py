#!/usr/bin/env python3
"""
Speech Bridge Script — DBT Studio
Offline speech-to-text for the AI chat input, powered by Vosk.

Reads raw 16 kHz mono 16-bit little-endian PCM from stdin and writes one JSON
event per line to stdout:
  {"type": "ready"}                     model loaded, audio may be sent
  {"type": "partial", "text": "..."}    in-progress hypothesis
  {"type": "result", "text": "..."}     a finished phrase
  {"type": "error", "message": "..."}
Exits when stdin closes, after flushing the final phrase.
"""

import argparse
import json
import sys

# 4000 bytes = 2000 samples = 125 ms at 16 kHz.
CHUNK_BYTES = 4000


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event) + "\n")
    sys.stdout.flush()


def read_chunk(stream) -> bytes:
    # read1 returns as soon as some data is available instead of blocking for
    # the full chunk, which keeps latency low.
    if hasattr(stream, "read1"):
        return stream.read1(CHUNK_BYTES)
    return stream.read(CHUNK_BYTES)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True, help="Path to the Vosk model directory")
    parser.add_argument("--rate", type=int, default=16000, help="PCM sample rate")
    args = parser.parse_args()

    try:
        from vosk import KaldiRecognizer, Model, SetLogLevel
    except ImportError:
        emit({"type": "error", "message": "The vosk package is not installed."})
        return 1

    SetLogLevel(-1)

    try:
        model = Model(args.model)
    except Exception as exc:  # noqa: BLE001 - reported to the app as an event
        emit({"type": "error", "message": f"Unable to load the speech model: {exc}"})
        return 1

    recognizer = KaldiRecognizer(model, args.rate)
    emit({"type": "ready"})

    stdin = sys.stdin.buffer
    last_partial = ""
    while True:
        data = read_chunk(stdin)
        if not data:
            break
        if recognizer.AcceptWaveform(data):
            text = json.loads(recognizer.Result()).get("text", "").strip()
            last_partial = ""
            if text:
                emit({"type": "result", "text": text})
        else:
            partial = json.loads(recognizer.PartialResult()).get("partial", "").strip()
            if partial != last_partial:
                last_partial = partial
                emit({"type": "partial", "text": partial})

    text = json.loads(recognizer.FinalResult()).get("text", "").strip()
    if text:
        emit({"type": "result", "text": text})
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        sys.exit(0)
    except Exception as exc:  # noqa: BLE001 - reported to the app as an event
        emit({"type": "error", "message": str(exc)})
        sys.exit(1)
