/** Renderer-side access to the shared analytics engine. */
import {
  collectRootIdentifiers,
  parseExpression,
} from '../../../../shared/analyticsBi/expressions/parser';

export * from '../../../../shared/analyticsBi';

/** Root identifiers an expression reads; [] when it doesn't parse. */
export function collectRootIdentifiersOf(source: string): string[] {
  try {
    return Array.from(collectRootIdentifiers(parseExpression(source)));
  } catch {
    return [];
  }
}
