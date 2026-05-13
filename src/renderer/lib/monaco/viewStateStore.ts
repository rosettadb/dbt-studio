import type * as monaco from 'monaco-editor';

const viewStates = new Map<string, monaco.editor.ICodeEditorViewState>();

/**
 * Persist or clear the view state (cursor, scroll, folding) for a key.
 * Pass tab id rather than path so renames don't lose the entry.
 */
export const saveViewState = (
  key: string,
  state: monaco.editor.ICodeEditorViewState | null,
): void => {
  if (state) viewStates.set(key, state);
  else viewStates.delete(key);
};

/** Retrieve a previously-saved view state, or undefined. */
export const getViewState = (
  key: string,
): monaco.editor.ICodeEditorViewState | undefined => viewStates.get(key);

/** Drop the view state for a key. Call this when a tab closes. */
export const clearViewState = (key: string): void => {
  viewStates.delete(key);
};

/** Drop every stored view state. Used on full app teardown. */
export const clearAllViewStates = (): void => {
  viewStates.clear();
};
