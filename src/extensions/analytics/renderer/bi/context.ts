import React from 'react';
import type {
  InputState,
  InputValue,
  QueryStatus,
} from '../../../../extensionApi/studio/analyticsBi';

export interface BiPageContextValue {
  results: Record<string, any[]>;
  statuses: Record<string, QueryStatus>;
  errors: Record<string, string | null>;
  durations: Record<string, number | undefined>;
  queryNames: Set<string>;
  inputs: InputState;
  setInput: (name: string, value: InputValue) => void;
  /** Inputs can't change results (static export): render them disabled. */
  readOnlyInputs: boolean;
  /** Show attribute warnings (editor only, not in exports). */
  showWarnings: boolean;
  /** Show a status row where each SQL block sits (off by default). */
  showQueries: boolean;
  onRunQuery?: (queryName: string) => void;
}

export const BiPageContext = React.createContext<BiPageContextValue>({
  results: {},
  statuses: {},
  errors: {},
  durations: {},
  queryNames: new Set(),
  inputs: {},
  setInput: () => undefined,
  readOnlyInputs: true,
  showWarnings: false,
  showQueries: false,
});

export const useBiPage = () => React.useContext(BiPageContext);

/** Variables from {#each} blocks, layered over the page scope. */
export const BiScopeContext = React.createContext<Record<string, unknown>>({});

export const useBiScope = () => React.useContext(BiScopeContext);

/** Expression scope: query rows by name, inputs, then {#each} variables. */
export function buildScope(
  page: BiPageContextValue,
  locals: Record<string, unknown>,
): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  page.queryNames.forEach((name) => {
    scope[name] = page.results[name];
  });
  scope.inputs = page.inputs;
  Object.assign(scope, locals);
  return scope;
}
