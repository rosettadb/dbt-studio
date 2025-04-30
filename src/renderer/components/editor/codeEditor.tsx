import MonacoEditor, { OnChange } from '@monaco-editor/react';
import React, { useEffect, useRef } from 'react';
import type * as monaco from 'monaco-editor';
import { CompletionItem } from '../../../types/frontend';
import { getChangedLineNumbers } from '../../helpers/utils';
import { Shimmer } from '../shimmer';

export const CodeEditor = ({
  content,
  originalContent,
  language,
  theme,
  onChange,
  completions = [],
}: {
  content: string;
  originalContent: string | null;
  language: string;
  theme: string;
  onChange: OnChange;
  completions?: Omit<CompletionItem, 'range'>[];
}) => {
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const decorationsRef =
    useRef<monaco.editor.IEditorDecorationsCollection | null>(null);
  const completionDisposableRef = useRef<monaco.IDisposable | null>(null);

  const applyHighlights = (current: string, original: string) => {
    if (!editorRef.current || !monacoRef.current) return;
    const { added, removed } = getChangedLineNumbers(original, current);
    const monacoInstance = monacoRef.current;
    const decorations = [
      ...added.map((line) => ({
        range: new monacoInstance.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'line-added',
          glyphMarginClassName: 'line-added-glyph',
        },
      })),
      ...removed.map((line) => ({
        range: new monacoInstance.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'line-removed',
          glyphMarginClassName: 'line-removed-glyph',
        },
      })),
    ];
    if (!decorationsRef.current) {
      decorationsRef.current =
        editorRef.current.createDecorationsCollection(decorations);
    } else {
      decorationsRef.current.set(decorations);
    }
  };

  const handleMount = async (
    editor: monaco.editor.IStandaloneCodeEditor,
    monacoInstance: typeof import('monaco-editor'),
  ) => {
    editorRef.current = editor;
    monacoRef.current = monacoInstance;
    decorationsRef.current?.clear();
    decorationsRef.current = null;
    if (originalContent) {
      applyHighlights(content, originalContent);
    }
    if (completions.length > 0) {
      completionDisposableRef.current?.dispose();
      completionDisposableRef.current =
        monacoInstance.languages.registerCompletionItemProvider(language, {
          provideCompletionItems: (model, position) => {
            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endColumn: word.endColumn,
            };
            const suggestions = completions.map((item) => ({
              ...item,
              range,
            }));
            return { suggestions };
          },
        });
    }
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current && originalContent) {
      applyHighlights(content, originalContent);
    }
  }, [content, originalContent]);

  useEffect(() => {
    return () => {
      completionDisposableRef.current?.dispose();
    };
  }, []);

  return (
    <MonacoEditor
      key="editor"
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
        glyphMargin: true,
      }}
    />
  );
};
