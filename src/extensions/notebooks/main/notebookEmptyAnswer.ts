import type { ScreenAgentToolCall } from '../../../extensionApi/main';

/**
 * What the Notebooks assistant says when the model ended a run without
 * writing anything (some models do after a tool call): a description of the
 * notebook it inspected, from the last `notebooks_get_state` call. Null when
 * the run did not inspect a notebook.
 */
export const describeInspectedNotebook = (
  toolCalls: ReadonlyArray<ScreenAgentToolCall>,
): string | null => {
  const notebookStateCall = [...toolCalls]
    .reverse()
    .find((tc) => tc.toolName === 'notebooks_get_state');
  const notebookState = (notebookStateCall?.output as any)?.data;
  const notebookCells = Array.isArray(notebookState?.cells)
    ? notebookState.cells
    : [];
  const notebookFallback =
    notebookStateCall && (notebookStateCall.output as any)?.ok !== false
      ? [
          `I inspected ${notebookState?.notebookName || notebookState?.name || 'the active notebook'}.`,
          `It has ${notebookCells.length} cell${notebookCells.length === 1 ? '' : 's'}.`,
          ...notebookCells.slice(0, 3).map((cell: any, index: number) => {
            // Python notebooks: preview / output label; legacy SQL: contentPreview / hasOutput
            const preview =
              cell.preview ||
              cell.contentPreview ||
              cell.content ||
              '(empty cell)';
            let outputText = ' No output is currently available.';
            if (typeof cell.output === 'string' && cell.output) {
              outputText = ` Output: ${cell.output}.`;
            } else if (cell.hasOutput) {
              outputText = ` Output is available${typeof cell.outputRowCount === 'number' ? ` (${cell.outputRowCount} rows loaded)` : ''}.`;
            }
            return `Cell ${index + 1} is ${cell.type || 'unknown'}: \`${String(preview).trim()}\`.${outputText}`;
          }),
          notebookCells.some((cell: any) => cell.status === 'error')
            ? 'At least one cell has an error output.'
            : 'I do not see a notebook execution error in the state returned by the tool.',
        ].join(' ')
      : null;
  return notebookFallback;
};
