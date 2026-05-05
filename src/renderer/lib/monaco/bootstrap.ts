import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { registerJinjaSqlLanguage } from './jinjaSqlLanguage';
import { registerCompletionProviders } from './completions';
import { registerSqlEnhanced } from './sqlEnhanced';

// Share our webpack-bundled monaco with @monaco-editor/react so the
// notebook and SQL run-tool editors don't load a second copy via AMD.
loader.config({ monaco });

let initialised = false;

const init = (): void => {
  if (initialised) return;
  initialised = true;

  registerJinjaSqlLanguage(monaco);
  registerSqlEnhanced(monaco);
  registerCompletionProviders(monaco);

  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: true,
  });
};

init();

/**
 * Returns the bundled Monaco namespace. Synchronous and safe to call from
 * anywhere — initialisation runs at module load.
 */
export const getMonaco = (): typeof monaco => monaco;
