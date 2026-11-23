import React from 'react';
import * as monaco from 'monaco-editor';
import { buildModelUri } from '../../lib/monaco/uri';
import type { ChartsDiagnostic } from '../../../shared/dbtCharts';

const OWNER = 'dbt-charts';

const toMarker = (
  model: monaco.editor.ITextModel,
  diagnostic: ChartsDiagnostic,
): monaco.editor.IMarkerData => {
  const lineCount = model.getLineCount();
  const startLine = Math.min(Math.max(diagnostic.line ?? 1, 1), lineCount);
  const endLine = Math.min(
    Math.max(diagnostic.endLine ?? startLine, startLine),
    lineCount,
  );
  // No column range means the whole line (dct's convention).
  const startColumn = diagnostic.column ?? 1;
  const endColumn = diagnostic.endColumn ?? model.getLineMaxColumn(endLine);
  const message = [
    diagnostic.code
      ? `${diagnostic.code}: ${diagnostic.message}`
      : diagnostic.message,
    diagnostic.fix ? `Fix: ${diagnostic.fix}` : null,
  ]
    .filter(Boolean)
    .join('\n');
  return {
    severity:
      diagnostic.severity === 'error'
        ? monaco.MarkerSeverity.Error
        : monaco.MarkerSeverity.Warning,
    message,
    code: diagnostic.code,
    source: 'dbt Charts',
    startLineNumber: startLine,
    endLineNumber: endLine,
    startColumn,
    endColumn: Math.max(endColumn, startColumn + 1),
  };
};

/**
 * Shows dct validate findings for this file as Monaco markers on the tab's
 * model. Findings that point at another file (an imported partial) are left
 * out; they still count in the status text.
 */
export const useChartsMarkers = (
  projectId: string,
  filePath: string,
  relativePath: string | null,
  diagnostics: ChartsDiagnostic[] | undefined,
): void => {
  React.useEffect(() => {
    const uri = buildModelUri(projectId, filePath);
    const mine = (diagnostics ?? []).filter(
      (d) => !d.file || !relativePath || d.file === relativePath,
    );
    const apply = (model: monaco.editor.ITextModel) =>
      monaco.editor.setModelMarkers(
        model,
        OWNER,
        mine.map((d) => toMarker(model, d)),
      );

    const existing = monaco.editor.getModel(uri);
    if (existing) apply(existing);
    const listener = monaco.editor.onDidCreateModel((model) => {
      if (model.uri.toString() === uri.toString()) apply(model);
    });
    return () => {
      listener.dispose();
      const model = monaco.editor.getModel(uri);
      if (model) monaco.editor.setModelMarkers(model, OWNER, []);
    };
  }, [projectId, filePath, relativePath, diagnostics]);
};
