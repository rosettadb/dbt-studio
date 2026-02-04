import type * as monaco from 'monaco-editor';

export type IMonaco = typeof import('monaco-editor');

export type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

export type IDisposable = monaco.IDisposable;

export type IEditorDecorationsCollection =
  monaco.editor.IEditorDecorationsCollection;

export type IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;

export type ITextModel = monaco.editor.ITextModel;

export type Range = monaco.Range;

export type EditorTabId = string;

export interface EditorTabState {
  id: EditorTabId;
  path: string;
  title: string;
  content: string;
  isModified: boolean;
  language?: string;
  isLoading: boolean;
  error?: string;
  viewState?: monaco.editor.ICodeEditorViewState | null;
  isReadOnly?: boolean;
}

export type TabOperationType = 'open' | 'close' | 'switch' | 'reorder';

export interface TabOperation {
  type: TabOperationType;
  tabId?: EditorTabId;
  path?: string;
  fromIndex?: number;
  toIndex?: number;
}

export interface TabContentUpdateOptions {
  markModified?: boolean;
}

export interface UpdateTabByPathOptions {
  markModified?: boolean;
  markSaved?: boolean;
}

export interface PendingCloseState {
  tabId: EditorTabId;
  tab: EditorTabState;
}

// SQL Tab types for connection-based SQL tool
export type SqlTabId = string;

export interface SqlTabState {
  id: SqlTabId;
  connectionId: string;
  connectionName: string;
  connectionType: string;
  query: string;
  results?: any;
  isModified: boolean;
  isLoading: boolean;
  error?: string;
}

export interface SqlPendingCloseState {
  tabId: SqlTabId;
  tab: SqlTabState;
}
