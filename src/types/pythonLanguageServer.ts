/** Bounded Python-only editor protocol; no arbitrary LSP methods or executable paths. */
export interface PythonLanguageServerStatus {
  state: 'ready' | 'starting' | 'missing' | 'needs-restart' | 'failed';
  version: string | null;
  pythonPath: string;
  message?: string;
}

export interface PythonLanguageDocument {
  modelUri: string;
  text: string;
  version: number;
}

export interface PythonLanguageRequest extends PythonLanguageDocument {
  requestId: string;
  kind: 'completion' | 'hover' | 'signature';
  line: number;
  character: number;
}

export interface PythonLanguageRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface PythonLanguageDiagnostic {
  range: PythonLanguageRange;
  message: string;
  severity?: number;
}

export type PythonLanguageEvent =
  | { type: 'status'; status: PythonLanguageServerStatus }
  | {
      type: 'diagnostics';
      modelUri: string;
      version: number;
      diagnostics: PythonLanguageDiagnostic[];
    };
