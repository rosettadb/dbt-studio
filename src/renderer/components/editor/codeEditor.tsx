import MonacoEditor, { OnChange } from '@monaco-editor/react';
import React, { useEffect, useRef } from 'react';
import { Shimmer } from '../shimmer';
import { getDecorations } from './helpers';
import {
  IDisposable,
  IEditorDecorationsCollection,
  IMonaco,
  IStandaloneCodeEditor,
} from './types';

export const CodeEditor = ({
  content,
  originalContent,
  language,
  theme,
  onChange,
  readOnly = false,
  onMount,
}: {
  content: string;
  originalContent: string | null;
  language: string;
  theme: string;
  onChange: OnChange;
  readOnly?: boolean;
  onMount?: (editor: IStandaloneCodeEditor) => void;
}) => {
  const [isMounted, setIsMounted] = React.useState(false);
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<IMonaco | null>(null);
  const decorationsRef = useRef<IEditorDecorationsCollection | null>(null);
  const completionDisposableRef = useRef<IDisposable | null>(null);

  const applyHighlights = (current: string, original: string | null) => {
    if (!editorRef.current || !monacoRef.current) return;

    const monacoInstance = monacoRef.current;
    const model = editorRef.current.getModel();
    if (!model) return;

    const range = (index: number) =>
      new monacoInstance.Range(index, 1, index, 1);

    const decorations = getDecorations(
      original,
      current,
      model.getLineCount(),
      range,
    );

    if (!decorationsRef.current) {
      decorationsRef.current =
        editorRef.current.createDecorationsCollection(decorations);
    } else {
      decorationsRef.current.set(decorations);
    }
  };

  const handleMount = async (
    editor: IStandaloneCodeEditor,
    monacoInstance: IMonaco,
  ) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;

    decorationsRef.current?.clear();
    decorationsRef.current = null;

    // Call the onMount callback if provided
    onMount?.(editor);

    setTimeout(() => {
      setIsMounted(true);
    }, 50);
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current && isMounted) {
      applyHighlights(content, originalContent);
    }
    return () => {
      completionDisposableRef.current?.dispose();
    };
  }, [content, originalContent, isMounted]);

  return (
    <MonacoEditor
      height="100%"
      width="100%"
      theme={theme}
      language={language}
      value={content}
      onMount={handleMount}
      onChange={onChange}
      loading={<Shimmer text="Loading editor..." />}
      options={{
        fontSize: 14,
        minimap: { enabled: false },
        lineNumbers: 'on',
        scrollBeyondLastLine: false,
        automaticLayout: true,
        readOnly,
      }}
    />
  );
};
