import React from 'react';
import * as monaco from 'monaco-editor';
import { getMonaco } from '../../lib/monaco/bootstrap';
import { getViewState, saveViewState } from '../../lib/monaco/viewStateStore';

type EditorOptions = monaco.editor.IStandaloneEditorConstructionOptions;

type Props = {
  /** The active text model. `null` shows a blank editor. */
  model: monaco.editor.ITextModel | null;
  /**
   * Stable identifier for the active model — the view-state store key.
   * Pass tab id (not path) so renames don't lose cursor / scroll state.
   */
  modelKey: string | null;
  theme: 'vs-dark' | 'light';
  readOnly?: boolean;
  options?: EditorOptions;
  /**
   * Forwarded ref to the underlying Monaco editor — useful for parents
   * that need to apply decorations, register actions, or read selection.
   */
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  /**
   * Called once after the editor is created. Return a cleanup if you
   * subscribe to anything; the cleanup runs on unmount.
   */
  onMount?: (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoNs: typeof monaco,
  ) => void | (() => void);
};

const BASE_OPTIONS: EditorOptions = {
  fontSize: 13,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  minimap: { enabled: false },
  // Keeps suggest/hover widgets above split panes and bottom terminals.
  fixedOverflowWidgets: true,
  quickSuggestions: { other: true, comments: false, strings: true },
  suggestOnTriggerCharacters: true,
  // WordHighlighter throws "Canceled" during model swap / dispose. We don't
  // need the feature; turning it off is the root-cause fix.
  occurrencesHighlight: 'off',
  // Monaco's own drop handler otherwise inserts the dropped OS file's path
  // as text into whatever model is currently active, racing with our
  // Editor-level onDrop that opens the file as a new tab.
  dropIntoEditor: { enabled: false },
};

/**
 * Thin React wrapper around `monaco.editor.create()`. Owns one editor
 * instance for the component's lifetime; tab switches reduce to a single
 * `setModel()` plus view-state save/restore.
 */
export const MonacoCodeEditor: React.FC<Props> = ({
  model,
  modelKey,
  theme,
  readOnly,
  options,
  editorRef,
  onMount,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorInstanceRef =
    React.useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onMountCleanupRef = React.useRef<(() => void) | undefined>(undefined);
  const previousModelKeyRef = React.useRef<string | null>(null);

  const onMountRef = React.useRef(onMount);
  onMountRef.current = onMount;

  const initialOptionsRef = React.useRef<EditorOptions>({
    ...BASE_OPTIONS,
    ...options,
    theme,
    readOnly,
  });

  React.useEffect(() => {
    if (!containerRef.current) return undefined;
    const monacoNs = getMonaco();
    const editor = monacoNs.editor.create(
      containerRef.current,
      initialOptionsRef.current,
    );
    editorInstanceRef.current = editor;
    if (editorRef) editorRef.current = editor;

    const cleanup = onMountRef.current?.(editor, monacoNs);
    if (typeof cleanup === 'function') onMountCleanupRef.current = cleanup;

    return () => {
      const lastKey = previousModelKeyRef.current;
      if (lastKey) saveViewState(lastKey, editor.saveViewState());

      onMountCleanupRef.current?.();
      onMountCleanupRef.current = undefined;
      editor.dispose();
      editorInstanceRef.current = null;
      if (editorRef) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    const editor = editorInstanceRef.current;
    if (!editor) return;
    editor.updateOptions({ ...options, readOnly });
  }, [readOnly, options]);

  React.useEffect(() => {
    const editor = editorInstanceRef.current;
    if (!editor) return;

    const previousKey = previousModelKeyRef.current;
    if (previousKey) saveViewState(previousKey, editor.saveViewState());

    editor.setModel(model);

    if (modelKey) {
      const state = getViewState(modelKey);
      if (state) editor.restoreViewState(state);
    }

    previousModelKeyRef.current = modelKey;
  }, [model, modelKey]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
