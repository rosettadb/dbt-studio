import React, { useEffect, useRef, useState } from 'react';
import type * as monaco from 'monaco-editor';
import { DiffEditor } from '@monaco-editor/react';

type Props = {
  modified: string;
  original: string;
  language: string;
  theme: string;
};

export const DiffView: React.FC<Props> = ({
  modified,
  original,
  language,
  theme,
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<monaco.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<monaco.editor.ITextModel | null>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    return () => {
      editorRef.current?.dispose();
      originalModelRef.current?.dispose();
      modifiedModelRef.current?.dispose();

      setMounted(false);
    };
  }, []);

  const handleEditorDidMount = (
    editor: monaco.editor.IStandaloneDiffEditor,
    monacoInstance: typeof monaco,
  ) => {
    editorRef.current = editor;

    const originalUri = monacoInstance.Uri.parse(
      `inmemory://model/original-${Date.now()}`,
    );
    const modifiedUri = monacoInstance.Uri.parse(
      `inmemory://model/modified-${Date.now()}`,
    );

    const originalModel = monacoInstance.editor.createModel(
      original,
      language,
      originalUri,
    );
    const modifiedModel = monacoInstance.editor.createModel(
      modified,
      language,
      modifiedUri,
    );

    originalModelRef.current = originalModel;
    modifiedModelRef.current = modifiedModel;

    editor.setModel({
      original: originalModel,
      modified: modifiedModel,
    });
  };

  if (!mounted) return null;

  return (
    <DiffEditor
      height="100%"
      width="100%"
      theme={theme}
      language={language}
      onMount={handleEditorDidMount}
      options={{
        renderSideBySide: true,
        fontSize: 14,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        glyphMargin: true,
      }}
    />
  );
};
