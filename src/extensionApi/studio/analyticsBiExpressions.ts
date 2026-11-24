/**
 * Transitional. The Analytics expression parser is still used by the Analytics AI agent and tools in
 * Studio's agent code. It moves into src/extensions/analytics with them,
 * and this file is deleted then (docs/extensions/PLAN.md, phase 5).
 */
export {
  collectRootIdentifiers,
  parseExpression,
} from '../../shared/analyticsBi/expressions/parser';
