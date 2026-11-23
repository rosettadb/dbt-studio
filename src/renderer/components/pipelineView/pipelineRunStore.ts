import React from 'react';

/**
 * What the pipeline dialogs should show right now. The tree row buttons,
 * the project run menu entries and the Create Pipeline button only write
 * here; `PipelineOverlays` renders the dialogs from it. That way none of
 * the places a pipeline can be started from needs to hold a dialog itself.
 */
export interface PipelineRunState {
  isCreateOpen: boolean;
  /** Arguments of a cloud run waiting for its dialog; null when none. */
  cloudRunArgs: string | null;
  /** Project-relative pipeline file of a local run waiting for its dialog. */
  localRunFile: string | null;
  /** Which "pick a pipeline first" dialog is open. */
  selectorMode: 'cloud' | 'local' | null;
}

const initialState: PipelineRunState = {
  isCreateOpen: false,
  cloudRunArgs: null,
  localRunFile: null,
  selectorMode: null,
};

let state = initialState;
const listeners = new Set<() => void>();

const setState = (patch: Partial<PipelineRunState>) => {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getState = () => state;

export const pipelineRunStore = {
  getState,
  subscribe,
  openCreate: () => setState({ isCreateOpen: true }),
  closeCreate: () => setState({ isCreateOpen: false }),
  requestCloudRun: (args: string) => setState({ cloudRunArgs: args }),
  clearCloudRun: () => setState({ cloudRunArgs: null }),
  requestLocalRun: (file: string) => setState({ localRunFile: file }),
  clearLocalRun: () => setState({ localRunFile: null }),
  openSelector: (mode: 'cloud' | 'local') => setState({ selectorMode: mode }),
  closeSelector: () => setState({ selectorMode: null }),
  reset: () => setState(initialState),
};

export const usePipelineRunState = (): PipelineRunState =>
  React.useSyncExternalStore(subscribe, getState, getState);
