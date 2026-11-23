/**
 * Analytics BI engine (Plan 97) — React-free core.
 *
 * Safe to import from the renderer, the main process and the static runtime.
 */
export * from './types';
export {
  parsePage,
  parseFrontmatter,
  walkNodes,
  collectSqlNodes,
  collectComponents,
  slotPlaceholder,
  SLOT_ATTRIBUTE,
} from './parser';
export {
  evaluateExpression,
  tryEvaluate,
  HELPERS,
  HELPER_NAMES,
  UnknownIdentifierError,
  ExpressionRuntimeError,
} from './expressions/evaluate';
export { parseExpression, collectInputNames } from './expressions/parser';
export { ExpressionSyntaxError } from './expressions/tokenizer';
export {
  formatValue,
  formatAxisValue,
  formatFromColumnName,
  isDateLike,
  toDate,
  detectDateGrain,
  formatDateForGrain,
  formatDateDefault,
  BUILT_IN_FORMATS,
} from './format';
export type { DateGrain } from './format';
export {
  collectInputDefinitions,
  defaultInputState,
  defaultFromOptions,
  interpolateSql,
  findInterpolations,
  sqlInputNames,
  escapeSqlString,
  toSqlText,
  staticOptions,
  resolveDatePreset,
  isInputComponent,
  DATE_RANGE_PRESETS,
  InterpolationError,
} from './inputs';
export type { InputDefinition, InputKind, StaticOption } from './inputs';
export {
  buildPageGraph,
  queriesAffectedByInputs,
  downstreamQueries,
  resolveQuerySql,
} from './graph';
export type { PageGraph, GraphError, QueryInfo } from './graph';
export {
  COMPONENT_SPECS,
  getComponentSpec,
  canonicalComponentName,
  canonicalPropName,
  aliasDefaults,
  retiredPropHint,
  allComponentNames,
} from './specs';
export type { ComponentSpec, PropSpec, ComponentCategory } from './specs';
export { validatePage, formatWarnings, componentPropIssues } from './validate';
export { buildComponentReference } from './reference';

/** Frontmatter `engine: legacy` keeps a page on the pre-Plan-97 renderer. */
export function usesLegacyEngine(markdown: string): boolean {
  if (!markdown.startsWith('---')) return false;
  const end = markdown.indexOf('\n---', 3);
  if (end === -1) return false;
  return /^engine\s*:\s*["']?legacy["']?\s*$/m.test(markdown.slice(3, end));
}
