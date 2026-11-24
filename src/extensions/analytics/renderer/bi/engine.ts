/** Renderer-side access to the shared analytics engine. */
import {
  collectRootIdentifiers,
  parseExpression,
} from '../../../../extensionApi/studio/analyticsBiExpressions';

export * from '../../../../extensionApi/studio/analyticsBi';

/** Root identifiers an expression reads; [] when it doesn't parse. */
export function collectRootIdentifiersOf(source: string): string[] {
  try {
    return Array.from(collectRootIdentifiers(parseExpression(source)));
  } catch {
    return [];
  }
}
