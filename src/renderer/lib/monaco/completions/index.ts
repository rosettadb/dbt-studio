import type * as monaco from 'monaco-editor';
import { registerJinjaSqlCompletions } from './jinjaSql';
import { registerSqlKeywordCompletions } from './sqlKeywords';
import { registerPythonCompletions } from './python';

type Monaco = typeof monaco;

let registered = false;

/**
 * Register every Monaco completion provider used by the app. Idempotent —
 * Monaco's completion registry is global by language id, so subsequent
 * calls would otherwise produce duplicate suggestions.
 */
export const registerCompletionProviders = (monacoNs: Monaco): void => {
  if (registered) return;
  registered = true;
  registerJinjaSqlCompletions(monacoNs);
  registerSqlKeywordCompletions(monacoNs);
  registerPythonCompletions(monacoNs);
};
