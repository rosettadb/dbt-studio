import React from 'react';
import * as monaco from 'monaco-editor';
import type { DbtChartsDiagnostic } from '../../../types/backend';

export const MARKER_OWNER = 'dbt-charts';

const severityOf = (s: DbtChartsDiagnostic['severity']) => {
  if (s === 'error') return monaco.MarkerSeverity.Error;
  if (s === 'warning') return monaco.MarkerSeverity.Warning;
  return monaco.MarkerSeverity.Info;
};

export const diagnosticsToMarkers = (
  diagnostics: DbtChartsDiagnostic[],
): monaco.editor.IMarkerData[] =>
  diagnostics.map((d) => {
    const line = d.line && d.line > 0 ? d.line : 1;
    const column = d.column && d.column > 0 ? d.column : 1;
    return {
      severity: severityOf(d.severity),
      message: d.message,
      code: d.code,
      source: 'dbt Charts',
      startLineNumber: line,
      startColumn: column,
      endLineNumber: line,
      endColumn: column + 1,
    };
  });

/**
 * Shows dct diagnostics as Monaco markers on the editor's current model.
 * Markers clear when `enabled` turns false, the model changes or the
 * component unmounts (tab closed / switched to text mode).
 */
export const useBoardMarkers = (
  editor: monaco.editor.IStandaloneCodeEditor | null,
  diagnostics: DbtChartsDiagnostic[],
  enabled: boolean,
) => {
  React.useEffect(() => {
    const model = editor?.getModel();
    if (!editor || !model || !enabled) return undefined;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      diagnosticsToMarkers(diagnostics),
    );
    return () => {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    };
  }, [editor, diagnostics, enabled]);
};
