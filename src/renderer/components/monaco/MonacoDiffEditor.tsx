import React from 'react';
import * as monaco from 'monaco-editor';
import { getMonaco } from '../../lib/monaco/bootstrap';

type DiffOptions = monaco.editor.IStandaloneDiffEditorConstructionOptions;

type Props = {
  original: string;
  modified: string;
  language: string;
  theme: 'vs-dark' | 'light';
  options?: DiffOptions;
};

const BASE_OPTIONS: DiffOptions = {
  renderSideBySide: true,
  fontSize: 13,
  minimap: { enabled: false },
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  glyphMargin: true,
  readOnly: true,
  // See note in MonacoCodeEditor: WordHighlighter throws "Canceled" during
  // model swap / dispose.
  occurrencesHighlight: 'off',
};

/**
 * React wrapper around `monaco.editor.createDiffEditor()`. Owns two
 * in-memory models for the diff sides and updates their content / language
 * via dedicated effects rather than recreating on every render.
 */
export const MonacoDiffEditor: React.FC<Props> = ({
  original,
  modified,
  language,
  theme,
  options,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const editorRef = React.useRef<monaco.editor.IStandaloneDiffEditor | null>(
    null,
  );
  const originalModelRef = React.useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = React.useRef<monaco.editor.ITextModel | null>(null);

  const initialContentRef = React.useRef({ original, modified, language });

  React.useEffect(() => {
    if (!containerRef.current) return undefined;
    const monacoNs = getMonaco();

    const editor = monacoNs.editor.createDiffEditor(containerRef.current, {
      ...BASE_OPTIONS,
      ...options,
      theme,
    });

    const originalModel = monacoNs.editor.createModel(
      initialContentRef.current.original,
      initialContentRef.current.language,
    );
    const modifiedModel = monacoNs.editor.createModel(
      initialContentRef.current.modified,
      initialContentRef.current.language,
    );

    editor.setModel({ original: originalModel, modified: modifiedModel });

    editorRef.current = editor;
    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    return () => {
      editor.dispose();
      originalModel.dispose();
      modifiedModel.dispose();
      editorRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    monaco.editor.setTheme(theme);
  }, [theme]);

  React.useEffect(() => {
    const o = originalModelRef.current;
    const m = modifiedModelRef.current;
    if (o && o.getValue() !== original) o.setValue(original);
    if (m && m.getValue() !== modified) m.setValue(modified);
  }, [original, modified]);

  React.useEffect(() => {
    if (originalModelRef.current) {
      monaco.editor.setModelLanguage(originalModelRef.current, language);
    }
    if (modifiedModelRef.current) {
      monaco.editor.setModelLanguage(modifiedModelRef.current, language);
    }
  }, [language]);

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />;
};
