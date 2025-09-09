import type * as monaco from 'monaco-editor';

export type IMonaco = typeof import('monaco-editor');

export type IStandaloneCodeEditor = monaco.editor.IStandaloneCodeEditor;

export type IDisposable = monaco.IDisposable;

export type IEditorDecorationsCollection =
  monaco.editor.IEditorDecorationsCollection;

export type IStandaloneDiffEditor = monaco.editor.IStandaloneDiffEditor;

export type ITextModel = monaco.editor.ITextModel;

export type Range = monaco.Range;
