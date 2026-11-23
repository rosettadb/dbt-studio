/**
 * Query dependency graph for a page.
 *
 * Nodes are SQL blocks. Edges come from `{{query}}` references (as before)
 * and from inputs: a query that reads `${inputs.region.value}` depends on the
 * Dropdown named "region", which in turn depends on the query that supplies
 * its options. Changing an input re-runs only the queries downstream of it.
 */
import { extractQueryReferences } from '../../../renderer/components/analytics/runtime/queryDependencyResolver';
import { collectSqlNodes } from '../parser';
import type { InputState, PageNode, SqlNode } from '../types';
import {
  collectInputDefinitions,
  InputDefinition,
  interpolateSql,
  sqlInputNames,
} from '../inputs';

export interface GraphError {
  type: 'missing' | 'circular' | 'self-reference' | 'duplicate';
  message: string;
  blockName?: string;
}

export interface QueryInfo {
  name: string;
  sql: string;
  refs: string[];
  inputs: string[];
  /** True when the SQL reads `inputs` with a computed name. */
  readsAllInputs: boolean;
}

export interface PageGraph {
  queries: Map<string, QueryInfo>;
  inputs: InputDefinition[];
  /** Topological order of query names (refs and input options first). */
  order: string[];
  errors: GraphError[];
}

function topoSort(
  nodes: string[],
  edges: Array<{ from: string; to: string }>,
): { order: string[]; remaining: string[] } {
  const inDegree = new Map<string, number>();
  const adjacency = new Map<string, string[]>();
  nodes.forEach((n) => {
    inDegree.set(n, 0);
    adjacency.set(n, []);
  });
  edges.forEach(({ from, to }) => {
    if (!inDegree.has(from) || !inDegree.has(to)) return;
    adjacency.get(from)!.push(to);
    inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
  });
  const queue = nodes.filter((n) => inDegree.get(n) === 0);
  const order: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    order.push(n);
    adjacency.get(n)!.forEach((m) => {
      inDegree.set(m, (inDegree.get(m) ?? 0) - 1);
      if (inDegree.get(m) === 0) queue.push(m);
    });
  }
  return { order, remaining: nodes.filter((n) => !order.includes(n)) };
}

export function buildPageGraph(nodes: PageNode[]): PageGraph {
  const sqlNodes = collectSqlNodes(nodes);
  const errors: GraphError[] = [];
  const queries = new Map<string, QueryInfo>();

  sqlNodes.forEach((node: SqlNode) => {
    if (queries.has(node.name)) {
      errors.push({
        type: 'duplicate',
        message: `Duplicate SQL block name "${node.name}" — each SQL block on a page must have a unique name`,
        blockName: node.name,
      });
      return;
    }
    const inputNames = sqlInputNames(node.sql);
    queries.set(node.name, {
      name: node.name,
      sql: node.sql,
      refs: extractQueryReferences(node.sql),
      inputs: Array.from(inputNames).filter((n) => n !== '*'),
      readsAllInputs: inputNames.has('*'),
    });
  });

  const names = new Set(queries.keys());
  const inputs = collectInputDefinitions(nodes, names);
  const optionsQueryByInput = new Map(
    inputs.filter((i) => i.optionsQuery).map((i) => [i.name, i.optionsQuery!]),
  );

  const edges: Array<{ from: string; to: string }> = [];
  queries.forEach((q) => {
    q.refs.forEach((ref) => {
      if (ref === q.name) {
        errors.push({
          type: 'self-reference',
          message: `Self-referencing query "${ref}" — query "${q.name}" references itself via {{${ref}}}`,
          blockName: q.name,
        });
      } else if (!names.has(ref)) {
        errors.push({
          type: 'missing',
          message: `Missing query reference: "${q.name}" references {{${ref}}}, but no SQL block named "${ref}" exists on this page`,
          blockName: q.name,
        });
      } else {
        edges.push({ from: ref, to: q.name });
      }
    });
    q.inputs.forEach((input) => {
      const optionsQuery = optionsQueryByInput.get(input);
      if (optionsQuery && optionsQuery !== q.name) {
        edges.push({ from: optionsQuery, to: q.name });
      }
    });
  });

  const { order, remaining } = topoSort(Array.from(names), edges);
  if (remaining.length > 0) {
    errors.push({
      type: 'circular',
      message: `Circular dependency detected among queries: ${remaining.join(', ')}`,
      blockName: remaining[0],
    });
  }

  return { queries, inputs, order, errors };
}

/**
 * Queries to re-run when the given inputs change: those that read the
 * inputs, plus everything downstream of them through {{refs}}. Returned in
 * execution order.
 */
export function queriesAffectedByInputs(
  graph: PageGraph,
  changedInputs: string[],
): string[] {
  const affected = new Set<string>();
  graph.queries.forEach((q) => {
    if (q.readsAllInputs || q.inputs.some((i) => changedInputs.includes(i))) {
      affected.add(q.name);
    }
  });
  // Propagate through refs until stable.
  const queries = Array.from(graph.queries.values());
  let grew = true;
  while (grew) {
    const added = queries.filter(
      (q) => !affected.has(q.name) && q.refs.some((r) => affected.has(r)),
    );
    added.forEach((q) => affected.add(q.name));
    grew = added.length > 0;
  }
  return graph.order.filter((name) => affected.has(name));
}

/** Queries that depend on `name` through refs (not including itself). */
export function downstreamQueries(graph: PageGraph, name: string): string[] {
  const out = new Set<string>();
  const queries = Array.from(graph.queries.values());
  let frontier = new Set([name]);
  while (frontier.size) {
    const current = frontier;
    const next = queries.filter(
      (q) => !out.has(q.name) && q.refs.some((r) => current.has(r)),
    );
    next.forEach((q) => out.add(q.name));
    frontier = new Set(next.map((q) => q.name));
  }
  return graph.order.filter((n) => out.has(n));
}

/**
 * Final SQL for a query: inputs interpolated, then `{{ref}}` replaced with
 * the referenced query's final SQL in parentheses (same as before Plan 97).
 */
export function resolveQuerySql(
  graph: PageGraph,
  name: string,
  inputs: InputState,
  memo = new Map<string, string>(),
  stack: string[] = [],
): string {
  const memoed = memo.get(name);
  if (memoed !== undefined) return memoed;
  const query = graph.queries.get(name);
  if (!query) throw new Error(`No SQL block named "${name}"`);
  if (stack.includes(name)) {
    throw new Error(
      `Circular dependency detected among queries: ${[...stack, name].join(', ')}`,
    );
  }
  const known = new Set(graph.inputs.map((i) => i.name));
  let sql = interpolateSql(query.sql, inputs, known);
  query.refs.forEach((ref) => {
    if (ref === name || !graph.queries.has(ref)) return;
    const refSql = resolveQuerySql(graph, ref, inputs, memo, [...stack, name]);
    sql = sql.replace(
      new RegExp(`\\{\\{\\s*${ref}\\s*\\}\\}`, 'g'),
      () => `(${refSql})`,
    );
  });
  memo.set(name, sql);
  return sql;
}
