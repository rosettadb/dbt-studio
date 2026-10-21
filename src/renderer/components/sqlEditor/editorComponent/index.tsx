/* eslint-disable no-plusplus, no-continue */
import React, { useEffect, useRef } from 'react';
import MonacoEditor, { OnMount, OnChange } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useTheme, Box, CircularProgress, Typography } from '@mui/material';
import { projectsServices } from '../../../services';
import { Container } from './styles';
import { Shimmer } from '../../shimmer';
import { parseSqlEditorStatements, ParsedStatement } from './statements';
import { parseOracleEditorStatements } from './oracleStatements';
import { CompletionItem } from '../../../../types/frontend';
import type { Table } from '../../../../types/backend';
import { useSchemaObjectDrop } from '../../../hooks/useSchemaObjectDrop';
import {
  clearSqlSchemaCompletions,
  setSqlSchemaCompletions,
} from '../../../lib/monaco/completions/sqlSchema';

type Props = {
  filePath?: string;
  connectionType?: string;
  content: string;
  setContent: (value: string) => void;
  completions?: Omit<CompletionItem, 'range'>[];
  /**
   * Raw table list behind `completions`. Optional; when present the shared
   * completion provider becomes context aware (`alias.` → columns, …).
   */
  schemaTables?: Table[];
  editorRef?: React.MutableRefObject<monaco.editor.IStandaloneCodeEditor | null>;
  onRunSelected?: (query: string) => void;
  isLoading?: boolean;
};

export const SqlEditorComponent: React.FC<Props> = ({
  filePath,
  connectionType,
  content,
  setContent,
  completions = [],
  schemaTables,
  editorRef,
  onRunSelected,
  isLoading,
}) => {
  const connectionTypeRef = useRef(connectionType);
  connectionTypeRef.current = connectionType;
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';
  const monacoTheme = isDarkMode ? 'vs-dark' : 'light';

  const saveDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const decorationIdsRef = useRef<string[]>([]);
  const monacoInstanceRef = useRef<typeof monaco | null>(null);
  const editorInstanceRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(
    null,
  );
  const statementsRef = useRef<ParsedStatement[]>([]);
  // Monaco model id this editor publishes its completions under.
  const modelIdRef = useRef<string | null>(null);

  // Accept tables/columns dragged from the Data tree (see useSchemaObjectDrop).
  const containerRef = useRef<HTMLDivElement>(null);
  const getEditorInstance = React.useCallback(
    () => editorInstanceRef.current,
    [],
  );
  useSchemaObjectDrop(containerRef, getEditorInstance);

  const handleChange: OnChange = (value) => {
    if (value === undefined) return;

    setContent(value);

    if (filePath) {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      saveDebounce.current = setTimeout(() => {
        projectsServices.saveFileContent({ path: filePath, content: value });
      }, 500);
    }
  };

  const refreshRunIcons = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const model = editor.getModel();
    const monacoInstance = monacoInstanceRef.current;
    if (!model || !monacoInstance) return;

    const statements =
      connectionTypeRef.current === 'oracle'
        ? parseOracleEditorStatements(model)
        : parseSqlEditorStatements(model);
    statementsRef.current = statements;

    const seenLines = new Set<number>();
    const newDecorations: monaco.editor.IModelDeltaDecoration[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const stmt of statements) {
      if (seenLines.has(stmt.startLine)) continue;
      seenLines.add(stmt.startLine);

      newDecorations.push({
        range: new monacoInstance.Range(stmt.startLine, 1, stmt.startLine, 1),
        options: {
          isWholeLine: true,
          glyphMarginClassName: 'run-query-glyph',
          glyphMarginHoverMessage: { value: '▶ Run this statement' },
        },
      });
    }

    decorationIdsRef.current = editor.deltaDecorations(
      decorationIdsRef.current,
      newDecorations,
    );
  };

  useEffect(() => {
    const editor = editorInstanceRef.current;
    if (editor) refreshRunIcons(editor);
  }, [connectionType]);

  const findStatementForLine = (
    lineNumber: number,
  ): ParsedStatement | undefined => {
    const statements = statementsRef.current;
    // Prefer an exact start-line match (the icon the user clicked on).
    const exact = statements.find((s) => s.startLine === lineNumber);
    if (exact) return exact;
    // Otherwise fall back to the statement that spans this line.
    return statements.find(
      (s) => s.startLine <= lineNumber && s.endLine >= lineNumber,
    );
  };

  // Publish this editor's completions to the shared `sql` provider (see
  // lib/monaco/completions/sqlSchema). Keyed by model id so several SQL
  // editors can coexist without duplicating each other's suggestions.
  const publishCompletions = React.useCallback(() => {
    const model = editorInstanceRef.current?.getModel();
    if (!model) return;
    modelIdRef.current = model.id;
    setSqlSchemaCompletions(model.id, {
      items: completions,
      tables: schemaTables,
    });
  }, [completions, schemaTables]);

  useEffect(() => {
    publishCompletions();
  }, [publishCompletions]);

  const handleEditorMount: OnMount = (editor, monacoInstance) => {
    monacoInstanceRef.current = monacoInstance;
    editorInstanceRef.current = editor;
    if (editorRef) editorRef.current = editor;

    publishCompletions();

    refreshRunIcons(editor);

    editor.onDidChangeModelContent(() => {
      setTimeout(() => refreshRunIcons(editor), 150);
    });

    editor.onMouseDown((e) => {
      if (
        e.target.type ===
          monacoInstance.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        onRunSelected
      ) {
        const lineNumber = e.target.position?.lineNumber;
        if (!lineNumber) return;

        const stmt = findStatementForLine(lineNumber);
        if (stmt?.text) onRunSelected(stmt.text);
      }
    });
  };

  useEffect(() => {
    return () => {
      if (saveDebounce.current) clearTimeout(saveDebounce.current);
      if (modelIdRef.current) {
        clearSqlSchemaCompletions(modelIdRef.current);
        modelIdRef.current = null;
      }
    };
  }, []);

  return (
    <Container ref={containerRef}>
      <MonacoEditor
        height="100%"
        width="100%"
        theme={monacoTheme}
        language="sql"
        value={content}
        onChange={handleChange}
        onMount={handleEditorMount}
        loading={<Shimmer text="Loading editor..." />}
        options={{
          fontSize: 13,
          glyphMargin: true,
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          readOnly: isLoading,
          // WordHighlighter throws "Canceled" during model swap / dispose.
          occurrencesHighlight: 'off',
          fixedOverflowWidgets: true,
        }}
      />
      {isLoading && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isDarkMode
              ? 'rgba(30, 30, 30, 0.7)'
              : 'rgba(255, 255, 255, 0.7)',
            zIndex: 10,
            backdropFilter: 'blur(2px)',
          }}
        >
          <CircularProgress size={40} thickness={4} />
          <Typography
            variant="body2"
            sx={{
              mt: 2,
              color: theme.palette.text.primary,
              fontWeight: 500,
            }}
          >
            Switching connection...
          </Typography>
        </Box>
      )}
    </Container>
  );
};
