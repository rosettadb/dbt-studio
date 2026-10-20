/**
 * Minimal `monaco-editor` stand-in. `src/renderer/lib/monaco/bootstrap.ts`
 * registers languages, themes and completion providers at import time, so
 * every API it touches must exist here. Everything is a no-op jest.fn().
 */

const disposable = () => ({ dispose: jest.fn() });

const makeEditorInstance = () => ({
  dispose: jest.fn(),
  getValue: jest.fn(() => ''),
  setValue: jest.fn(),
  getModel: jest.fn(() => null),
  setModel: jest.fn(),
  onDidChangeModelContent: jest.fn(disposable),
  onDidBlurEditorWidget: jest.fn(disposable),
  onDidFocusEditorWidget: jest.fn(disposable),
  addCommand: jest.fn(),
  addAction: jest.fn(disposable),
  focus: jest.fn(),
  layout: jest.fn(),
  updateOptions: jest.fn(),
  saveViewState: jest.fn(() => null),
  restoreViewState: jest.fn(),
  createDecorationsCollection: jest.fn(() => ({
    set: jest.fn(),
    clear: jest.fn(),
  })),
  getPosition: jest.fn(() => null),
  setPosition: jest.fn(),
  executeEdits: jest.fn(),
  trigger: jest.fn(),
});

export const languages = {
  getLanguages: jest.fn(() => []),
  register: jest.fn(),
  setLanguageConfiguration: jest.fn(disposable),
  setMonarchTokensProvider: jest.fn(disposable),
  registerCompletionItemProvider: jest.fn(disposable),
  registerCodeLensProvider: jest.fn(disposable),
  CompletionItemKind: {
    Keyword: 17,
    Module: 8,
    Function: 1,
    Value: 11,
    Snippet: 27,
    Variable: 4,
    Method: 0,
    Field: 3,
    Class: 5,
  },
  CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
  typescript: {
    javascriptDefaults: { setDiagnosticsOptions: jest.fn() },
    typescriptDefaults: { setDiagnosticsOptions: jest.fn() },
  },
};

export const editor = {
  defineTheme: jest.fn(),
  setTheme: jest.fn(),
  create: jest.fn(makeEditorInstance),
  createDiffEditor: jest.fn(makeEditorInstance),
  createModel: jest.fn(() => ({
    dispose: jest.fn(),
    getValue: jest.fn(() => ''),
    setValue: jest.fn(),
    uri: { toString: () => 'inmemory://model/1' },
    onDidChangeContent: jest.fn(disposable),
  })),
  getModel: jest.fn(() => null),
  getModels: jest.fn(() => []),
  setModelLanguage: jest.fn(),
  registerCommand: jest.fn(disposable),
  getFocusedCodeEditor: jest.fn(() => null),
};

export const Uri = {
  from: jest.fn((parts: unknown) => parts),
  parse: jest.fn((value: string) => ({ toString: () => value })),
  file: jest.fn((value: string) => ({ toString: () => value })),
};

export const KeyMod = { CtrlCmd: 2048, Shift: 1024, Alt: 512, WinCtrl: 256 };
export const KeyCode = { Enter: 3, KeyF: 36, KeyS: 49 };
export const MarkerSeverity = { Hint: 1, Info: 2, Warning: 4, Error: 8 };

export class Range {
  startLineNumber: number;

  startColumn: number;

  endLineNumber: number;

  endColumn: number;

  constructor(
    startLineNumber: number,
    startColumn: number,
    endLineNumber: number,
    endColumn: number,
  ) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
}
