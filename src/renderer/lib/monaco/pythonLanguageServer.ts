import type * as monaco from 'monaco-editor';
import {
  notebooksService,
  pythonLanguagePrefix,
  onPythonLanguageContextChange,
} from '../../services/notebooks.service';
import type {
  PythonLanguageRange,
  PythonLanguageRequest,
} from '../../../types/pythonLanguageServer';

type Monaco = typeof monaco;
type Model = monaco.editor.ITextModel;
type Completion = {
  label: string;
  kind?: number;
  insertText?: string;
  detail?: string;
  documentation?: string | { value: string };
  sortText?: string;
  filterText?: string;
  textEdit?: { newText: string; range: PythonLanguageRange };
};
const markerOwner = 'rosetta-python-lsp';
const tracked = new Map<Model, { dispose: () => void; sync: () => void }>();
let registered = false;
let sequence = 0;

const eligible = (model: Model) =>
  model.getLanguageId() === 'python' &&
  (model.uri.path.startsWith('/__rosetta_python_notebooks__/') ||
    (model.uri.scheme === 'dbt-file' &&
      model.uri.authority !== 'default' &&
      model.uri.path.endsWith('.py')));
let documentVersion = 0;
const snapshots = new WeakMap<
  Model,
  {
    modelUri: string;
    text: string;
    version: number;
    modelVersion: number;
    prefix: string;
    offset: number;
  }
>();
const snapshot = (model: Model) => {
  const prefix = pythonLanguagePrefix(model.uri.path);
  const previous = snapshots.get(model);
  if (
    previous?.modelVersion === model.getVersionId() &&
    previous.prefix === prefix
  )
    return previous;
  documentVersion += 1;
  const current = {
    modelUri: model.uri.toString(),
    text: prefix + model.getValue(),
    version: documentVersion,
    modelVersion: model.getVersionId(),
    prefix,
    offset: prefix.split('\n').length - 1,
  };
  snapshots.set(model, current);
  return current;
};
const markdown = (value: unknown): monaco.IMarkdownString => {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (
    value &&
    typeof value === 'object' &&
    'value' in value &&
    typeof value.value === 'string'
  )
    text = value.value;
  return { value: text.slice(0, 12000), isTrusted: false, supportHtml: false };
};
const range = (model: Model, value: PythonLanguageRange): monaco.IRange =>
  model.validateRange({
    startLineNumber: value.start.line - snapshot(model).offset + 1,
    startColumn: value.start.character + 1,
    endLineNumber: value.end.line - snapshot(model).offset + 1,
    endColumn: value.end.character + 1,
  });

async function request(
  model: Model,
  position: monaco.Position,
  kind: PythonLanguageRequest['kind'],
  token: monaco.CancellationToken,
): Promise<unknown> {
  if (
    !eligible(model) ||
    model.isDisposed() ||
    token.isCancellationRequested ||
    model.getValueLength() > 512 * 1024
  )
    return null;
  const document = snapshot(model);
  if (document.text.length > 512 * 1024) return null;
  const { version } = document;
  sequence += 1;
  const requestId = `python-${sequence}`;
  const cancellation = token.onCancellationRequested(() => {
    notebooksService
      .cancelPythonLanguageRequest(requestId)
      .catch(() => undefined);
  });
  try {
    const result = await notebooksService.requestPythonLanguage({
      modelUri: document.modelUri,
      text: document.text,
      version: document.version,
      requestId,
      kind,
      line: document.offset + position.lineNumber - 1,
      character: position.column - 1,
    });
    if (
      token.isCancellationRequested ||
      model.isDisposed() ||
      snapshot(model).version !== version
    )
      return null;
    return result;
  } catch {
    // The existing local completion provider remains available if LSP is down.
    return null;
  } finally {
    cancellation.dispose();
  }
}

export async function pythonLanguageCompletions(
  monacoNs: Monaco,
  model: Model,
  position: monaco.Position,
  token: monaco.CancellationToken,
): Promise<monaco.languages.CompletionList | null> {
  const response = (await request(model, position, 'completion', token)) as
    | Completion[]
    | { items: Completion[]; isIncomplete?: boolean }
    | null;
  if (!response) return null;
  const items = Array.isArray(response) ? response : response.items;
  if (!Array.isArray(items)) return null;
  const word = model.getWordUntilPosition(position);
  const fallbackRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn,
  };
  // LSP and Monaco completion-kind numeric values are different.
  const kinds: Record<number, monaco.languages.CompletionItemKind> = {
    1: monacoNs.languages.CompletionItemKind.Text,
    2: monacoNs.languages.CompletionItemKind.Method,
    3: monacoNs.languages.CompletionItemKind.Function,
    5: monacoNs.languages.CompletionItemKind.Field,
    6: monacoNs.languages.CompletionItemKind.Variable,
    7: monacoNs.languages.CompletionItemKind.Class,
    9: monacoNs.languages.CompletionItemKind.Module,
    10: monacoNs.languages.CompletionItemKind.Property,
    14: monacoNs.languages.CompletionItemKind.Keyword,
    17: monacoNs.languages.CompletionItemKind.File,
    18: monacoNs.languages.CompletionItemKind.Reference,
  };
  return {
    incomplete: !Array.isArray(response) && response.isIncomplete,
    suggestions: items
      .slice(0, 300)
      .filter((item) => typeof item.label === 'string')
      .map((item) => ({
        label: item.label.slice(0, 256),
        insertText: (
          item.textEdit?.newText ??
          item.insertText ??
          item.label
        ).slice(0, 12000),
        kind:
          kinds[item.kind ?? 1] ?? monacoNs.languages.CompletionItemKind.Text,
        detail: item.detail?.slice(0, 2000),
        documentation: markdown(item.documentation),
        sortText: item.sortText,
        filterText: item.filterText,
        range: item.textEdit?.range
          ? range(model, item.textEdit.range)
          : fallbackRange,
      })),
  };
}

export function registerPythonLanguageServer(monacoNs: Monaco) {
  if (registered) return;
  registered = true;
  const attach = (model: Model) => {
    if (!eligible(model) || tracked.has(model)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    const sync = () => {
      if (disposed || model.isDisposed() || model.getValueLength() > 512 * 1024)
        return;
      const document = snapshot(model);
      if (document.text.length > 512 * 1024) return;
      notebooksService
        .syncPythonLanguageDocument({
          modelUri: document.modelUri,
          text: document.text,
          version: document.version,
        })
        .finally(() => {
          if (disposed)
            notebooksService
              .closePythonLanguageDocument(model.uri.toString())
              .catch(() => undefined);
        })
        .catch(() => undefined);
    };
    const changes = model.onDidChangeContent(() => {
      clearTimeout(timer);
      monacoNs.editor.setModelMarkers(model, markerOwner, []);
      timer = setTimeout(sync, 250);
    });
    const dispose = () => {
      disposed = true;
      clearTimeout(timer);
      changes.dispose();
      tracked.delete(model);
      if (!model.isDisposed())
        monacoNs.editor.setModelMarkers(model, markerOwner, []);
      notebooksService
        .closePythonLanguageDocument(model.uri.toString())
        .catch(() => undefined);
    };
    model.onWillDispose(dispose);
    tracked.set(model, { dispose, sync });
    sync();
  };
  monacoNs.editor.onDidCreateModel(attach);
  monacoNs.editor.onDidChangeModelLanguage(({ model }) => {
    tracked.get(model)?.dispose();
    attach(model);
  });
  monacoNs.editor.getModels().forEach(attach);
  let contextTimer: ReturnType<typeof setTimeout> | undefined;
  onPythonLanguageContextChange(() => {
    clearTimeout(contextTimer);
    tracked.forEach((_value, model) =>
      monacoNs.editor.setModelMarkers(model, markerOwner, []),
    );
    contextTimer = setTimeout(
      () => tracked.forEach((value) => value.sync()),
      250,
    );
  });
  notebooksService.onPythonLanguageEvent((event) => {
    if (event.type === 'status') {
      if (event.status.state !== 'ready')
        tracked.forEach((_value, model) =>
          monacoNs.editor.setModelMarkers(model, markerOwner, []),
        );
      return;
    }
    const model = monacoNs.editor.getModel(monacoNs.Uri.parse(event.modelUri));
    if (
      !model ||
      !tracked.has(model) ||
      snapshot(model).version !== event.version
    )
      return;
    const severity = [
      monacoNs.MarkerSeverity.Error,
      monacoNs.MarkerSeverity.Warning,
      monacoNs.MarkerSeverity.Info,
      monacoNs.MarkerSeverity.Hint,
    ];
    monacoNs.editor.setModelMarkers(
      model,
      markerOwner,
      event.diagnostics
        .filter((item) => item.range.start.line >= snapshot(model).offset)
        .map((item) => ({
          ...range(model, item.range),
          message: item.message,
          severity:
            severity[(item.severity ?? 1) - 1] ?? monacoNs.MarkerSeverity.Info,
          source: 'Python',
        })),
    );
  });
  monacoNs.languages.registerHoverProvider('python', {
    provideHover: async (model, position, token) => {
      const result = (await request(model, position, 'hover', token)) as {
        contents?: unknown;
        range?: PythonLanguageRange;
      } | null;
      if (!result?.contents) return null;
      const contents = Array.isArray(result.contents)
        ? result.contents
        : [result.contents];
      return {
        contents: contents.slice(0, 10).map(markdown),
        range: result.range ? range(model, result.range) : undefined,
      };
    },
  });
  monacoNs.languages.registerSignatureHelpProvider('python', {
    signatureHelpTriggerCharacters: ['(', ','],
    signatureHelpRetriggerCharacters: [')'],
    provideSignatureHelp: async (model, position, token) => {
      const result = (await request(model, position, 'signature', token)) as {
        activeSignature?: number;
        activeParameter?: number;
        signatures?: {
          label: string;
          documentation?: unknown;
          parameters?: {
            label: string | [number, number];
            documentation?: unknown;
          }[];
        }[];
      } | null;
      if (!Array.isArray(result?.signatures) || !result.signatures.length)
        return null;
      return {
        value: {
          activeSignature: result.activeSignature ?? 0,
          activeParameter: result.activeParameter ?? 0,
          signatures: result.signatures.slice(0, 20).map((item) => ({
            label: item.label.slice(0, 4000),
            documentation: markdown(item.documentation),
            parameters: (item.parameters ?? []).slice(0, 100).map((param) => ({
              label: param.label,
              documentation: markdown(param.documentation),
            })),
          })),
        },
        dispose: () => undefined,
      };
    },
  });
}
