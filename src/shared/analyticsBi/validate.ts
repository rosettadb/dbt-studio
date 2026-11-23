/**
 * Page validation: structural parse warnings plus checks against the
 * component specs (unknown tags and attributes, missing queries, inputs
 * without a name). Used for warning chips in the preview and returned to
 * the AI agent after it writes a page.
 */
import { collectComponents, parsePage, walkNodes } from './parser';
import { buildPageGraph } from './graph';
import {
  canonicalComponentName,
  canonicalPropName,
  getComponentSpec,
  retiredPropHint,
} from './specs';
import type { ComponentNode, ParseWarning } from './types';
import { parseExpression } from './expressions/parser';

/** Attributes accepted on every component. */
const UNIVERSAL_PROPS = new Set(['key', 'id', 'class', 'className', 'style']);

export interface ComponentPropIssue {
  prop: string;
  message: string;
  retired: boolean;
}

/** Unknown or retired attributes on one component. */
export function componentPropIssues(node: ComponentNode): ComponentPropIssue[] {
  const spec = getComponentSpec(node.tag);
  if (!spec) return [];
  const issues: ComponentPropIssue[] = [];
  node.props.forEach((prop) => {
    if (
      UNIVERSAL_PROPS.has(prop.name) &&
      !canonicalPropName(node.tag, prop.name)
    )
      return;
    if (canonicalPropName(node.tag, prop.name)) return;
    const hint = retiredPropHint(node.tag, prop.name);
    if (hint !== undefined) {
      issues.push({
        prop: prop.name,
        message: `${prop.name} has no effect on <${spec.name}>. ${hint}`,
        retired: true,
      });
      return;
    }
    issues.push({
      prop: prop.name,
      message: `<${spec.name}> has no attribute "${prop.name}"`,
      retired: false,
    });
  });
  return issues;
}

export function validatePage(markdown: string): ParseWarning[] {
  const parsed = parsePage(markdown);
  const warnings: ParseWarning[] = [...parsed.warnings];
  const graph = buildPageGraph(parsed.nodes);
  const queryNames = new Set(graph.queries.keys());

  graph.errors.forEach((error) => {
    warnings.push({
      code: error.type === 'duplicate' ? 'duplicate-query' : 'missing-query',
      message: error.message,
      line: 0,
    });
  });

  collectComponents(parsed.nodes).forEach((node) => {
    const spec = getComponentSpec(node.tag);
    if (!spec) {
      warnings.push({
        code: 'unknown-component',
        message: `Unknown component <${node.tag}>`,
        line: node.line,
      });
      return;
    }
    componentPropIssues(node)
      .filter((issue) => !issue.retired)
      .forEach((issue) =>
        warnings.push({
          code: 'unknown-prop',
          message: issue.message,
          line: node.line,
        }),
      );

    const data = node.props.find((p) => p.name === 'data');
    if (data && data.value.kind !== 'flag') {
      const source =
        data.value.kind === 'expr' ? data.value.source : data.value.value;
      if (/^[A-Za-z_]\w*$/.test(source) && !queryNames.has(source)) {
        warnings.push({
          code: 'missing-query',
          message: `<${spec.name}> uses data={${source}}, but no SQL block named "${source}" exists`,
          line: node.line,
        });
      }
    }

    if (
      spec.category === 'inputs' &&
      spec.props.some((p) => p.name === 'name')
    ) {
      if (!node.props.some((p) => p.name === 'name')) {
        warnings.push({
          code: 'unnamed-input',
          message: `<${spec.name}> needs a name="..." so SQL can read it as \${inputs.<name>.value}`,
          line: node.line,
        });
      }
    }

    node.props.forEach((prop) => {
      if (prop.value.kind === 'expr') {
        try {
          parseExpression(prop.value.source);
        } catch (error) {
          warnings.push({
            code: 'bad-expression',
            message: `${canonicalComponentName(node.tag)} ${prop.name}={${prop.value.source}}: ${(error as Error).message}`,
            line: node.line,
          });
        }
      }
    });
  });

  walkNodes(parsed.nodes, (node) => {
    if (node.type === 'if') {
      node.branches.forEach((b) => {
        if (b.condition === undefined) return;
        try {
          parseExpression(b.condition);
        } catch (error) {
          warnings.push({
            code: 'bad-expression',
            message: `{#if ${b.condition}}: ${(error as Error).message}`,
            line: node.line,
          });
        }
      });
    }
    if (node.type === 'each') {
      try {
        parseExpression(node.expr);
      } catch (error) {
        warnings.push({
          code: 'bad-expression',
          message: `{#each ${node.expr}}: ${(error as Error).message}`,
          line: node.line,
        });
      }
    }
  });

  return warnings;
}

/** One-line-per-warning text for the agent. */
export function formatWarnings(warnings: ParseWarning[]): string {
  return warnings
    .map((w) => (w.line ? `line ${w.line}: ${w.message}` : w.message))
    .join('\n');
}
