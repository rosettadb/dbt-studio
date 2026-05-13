import type * as monaco from 'monaco-editor';
import { languageIntelligenceService } from '../../../services';
import { projectIdFromUri } from '../uri';

type Monaco = typeof monaco;

// Jinja/dbt context detectors. Each returns the partial token typed by the
// user so the provider can anchor the replacement range correctly.

const refContext = (line: string) => {
  const m = line.match(/\bref\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { partial: m[2] } : null;
};

const sourceTableContext = (line: string) => {
  const m = line.match(
    /\bsource\(\s*(['"])([^'"]+)\1\s*,\s*(['"]?)([^'")\s]*)$/,
  );
  return m ? { sourceName: m[2], partial: m[4] } : null;
};

const sourceNameContext = (line: string) => {
  const m = line.match(/\bsource\(\s*(['"]?)([^'",)\s]*)$/);
  return m ? { partial: m[2] } : null;
};

const docContext = (line: string) => {
  const m = line.match(/\bdoc\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { partial: m[2] } : null;
};

const macroContext = (line: string) => {
  const m = line.match(/\{\{-?\s*([a-zA-Z_][\w]*)$/);
  return m ? { partial: m[1] } : null;
};

const varContext = (line: string) => {
  const m = line.match(/\bvar\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { partial: m[2] } : null;
};

const envVarContext = (line: string) => {
  const m = line.match(/\benv_var\(\s*(['"]?)([^'")\s]*)$/);
  return m ? { partial: m[2] } : null;
};

const DBT_BUILTIN_MACROS = [
  'ref',
  'source',
  'config',
  'doc',
  'var',
  'env_var',
  'run_query',
  'log',
  'this',
  'adapter',
  'execute',
  'exceptions',
  'modules',
  'flags',
  'target',
  'is_incremental',
  'generate_schema_name',
  'generate_alias_name',
];

const startsWith = (haystack: string, needle: string) =>
  haystack.toLowerCase().startsWith(needle.toLowerCase());

const includesCi = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

/**
 * Register dbt-aware completion providers for `jinja-sql` (model refs,
 * sources, docs, vars, env_vars, macros) and `yaml` (doc references).
 * Project context is read from `model.uri.authority` so the provider works
 * correctly across multiple open projects.
 */
export const registerJinjaSqlCompletions = (monacoNs: Monaco): void => {
  monacoNs.languages.registerCompletionItemProvider('jinja-sql', {
    triggerCharacters: ["'", '"', '(', '.', ','],
    provideCompletionItems: async (model, position) => {
      try {
        const projectId = projectIdFromUri(model.uri);
        const line = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });

        const makeRange = (partial: string) => ({
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - partial.length,
          endColumn: position.column,
        });

        const kind = monacoNs.languages.CompletionItemKind;

        const ref = refContext(line);
        if (ref) {
          const res = await languageIntelligenceService.listModels(projectId);
          const range = makeRange(ref.partial);
          return {
            suggestions: res.models
              .filter((m) => !ref.partial || startsWith(m.name, ref.partial))
              .slice(0, 200)
              .map((m) => ({
                label: m.name,
                kind: kind.Module,
                insertText: m.name,
                filterText: m.name,
                detail: m.packageName,
                documentation: m.description,
                range,
              })),
          };
        }

        const srcTable = sourceTableContext(line);
        if (srcTable) {
          const res = await languageIntelligenceService.listSources(projectId);
          const range = makeRange(srcTable.partial);
          return {
            suggestions: res.sources
              .filter((s) => s.sourceName === srcTable.sourceName)
              .filter(
                (s) =>
                  !srcTable.partial ||
                  startsWith(s.tableName, srcTable.partial),
              )
              .slice(0, 200)
              .map((s) => ({
                label: s.tableName,
                kind: kind.Field,
                insertText: s.tableName,
                filterText: s.tableName,
                documentation: s.description,
                range,
              })),
          };
        }

        const srcName = sourceNameContext(line);
        if (srcName) {
          const res = await languageIntelligenceService.listSources(projectId);
          const names = [...new Set(res.sources.map((s) => s.sourceName))];
          const range = makeRange(srcName.partial);
          return {
            suggestions: names
              .filter((n) => !srcName.partial || startsWith(n, srcName.partial))
              .map((n) => ({
                label: n,
                kind: kind.Module,
                insertText: n,
                filterText: n,
                range,
              })),
          };
        }

        const doc = docContext(line);
        if (doc) {
          const res = await languageIntelligenceService.listDocs(projectId);
          const range = makeRange(doc.partial);
          return {
            suggestions: res.docs
              .filter((d) => !doc.partial || startsWith(d.name, doc.partial))
              .slice(0, 200)
              .map((d) => ({
                label: d.name,
                kind: kind.Value,
                insertText: d.name,
                filterText: d.name,
                documentation: d.description,
                range,
              })),
          };
        }

        const variable = varContext(line);
        if (variable) {
          const res =
            await languageIntelligenceService.listVariables(projectId);
          const range = makeRange(variable.partial);
          return {
            suggestions: res.variables
              .filter(
                (v) =>
                  !variable.partial || startsWith(v.name, variable.partial),
              )
              .map((v) => ({
                label: v.name,
                kind: kind.Variable,
                insertText: v.name,
                filterText: v.name,
                range,
              })),
          };
        }

        const env = envVarContext(line);
        if (env) {
          const res = await languageIntelligenceService.listEnvVars(projectId);
          const range = makeRange(env.partial);
          return {
            suggestions: res.envVars
              .filter(
                (e: { name: string }) =>
                  !env.partial || startsWith(e.name, env.partial),
              )
              .map((e: { name: string }) => ({
                label: e.name,
                kind: kind.Constant,
                insertText: e.name,
                filterText: e.name,
                range,
              })),
          };
        }

        const macro = macroContext(line);
        if (macro) {
          const res = await languageIntelligenceService.listMacros(projectId);
          const macroNames = [
            ...new Set([
              ...res.macros.map((m) => m.name),
              ...DBT_BUILTIN_MACROS,
            ]),
          ];
          const range = makeRange(macro.partial);
          return {
            suggestions: macroNames
              .filter((n) => !macro.partial || startsWith(n, macro.partial))
              .map((n) => ({
                label: n,
                kind: kind.Function,
                insertText: n,
                filterText: n,
                range,
              })),
          };
        }

        return { suggestions: [] };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[jinja-sql] completion provider error:', error);
        return { suggestions: [] };
      }
    },
  });

  // YAML doc(...) completion. The YAML provider lives here too because it
  // shares the dbt language intelligence service and the same partial-match
  // helpers — keeping them together avoids duplicating the docs lookup.
  monacoNs.languages.registerCompletionItemProvider('yaml', {
    triggerCharacters: ["'", '"', '('],
    provideCompletionItems: async (model, position) => {
      try {
        const projectId = projectIdFromUri(model.uri);
        const line = model.getValueInRange({
          startLineNumber: position.lineNumber,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        });
        const ctx = docContext(line);
        if (!ctx) return { suggestions: [] };
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: position.column - ctx.partial.length,
          endColumn: position.column,
        };
        const res = await languageIntelligenceService.listDocs(projectId);
        return {
          suggestions: res.docs
            .filter((d) => !ctx.partial || includesCi(d.name, ctx.partial))
            .slice(0, 200)
            .map((d) => ({
              label: d.name,
              kind: monacoNs.languages.CompletionItemKind.Value,
              insertText: d.name,
              filterText: d.name,
              documentation: d.description,
              range,
            })),
        };
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[yaml] completion provider error:', error);
        return { suggestions: [] };
      }
    },
  });
};
