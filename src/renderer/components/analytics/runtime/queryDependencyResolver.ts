import {
  parseAnalyticsMarkdown,
  type AnalyticsBlock,
} from '../../../utils/analyticsMarkdown';

type SqlAnalyticsBlock = Extract<AnalyticsBlock, { type: 'sql' }>;

export interface QueryDependencyGraph {
  nodes: string[];
  edges: Array<{ from: string; to: string }>;
  topoOrder: string[];
}

function findRefs(text: string, refs: Set<string>): void {
  let inString = false;
  let stringChar = '';
  let inQuotedId = false;
  let quotedIdChar = '';

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1] ?? '';

    if (inString) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === stringChar) {
        inString = false;
      }
    } else if (inQuotedId) {
      if (ch === '\\') {
        i += 1;
      } else if (ch === quotedIdChar) {
        inQuotedId = false;
      }
    } else if (ch === "'") {
      inString = true;
      stringChar = ch;
    } else if (ch === '"' || ch === '`') {
      inQuotedId = true;
      quotedIdChar = ch;
    } else if (ch === '{' && next === '{') {
      const endIdx = text.indexOf('}}', i + 2);
      if (endIdx !== -1) {
        const refName = text.slice(i + 2, endIdx).trim();
        if (refName && /^\w+$/.test(refName)) {
          refs.add(refName);
        }
        i = endIdx + 1;
      }
    }
  }
}

/**
 * Extract {{query_name}} references from SQL text.
 * Only matches standalone references that look like subquery references.
 * Does NOT match inside:
 *   - Single-line comments (-- ...)
 *   - Multi-line comments (/* ... * /)
 *   - String literals ('...')
 *   - Quoted identifiers ("..." or `...`)
 */
export function extractQueryReferences(sql: string): string[] {
  const refs = new Set<string>();

  // State machine to avoid matching inside comments/strings
  const lines = sql.split('\n');
  let inBlockComment = false;

  lines.forEach((line) => {
    const trimmed = line.trim();

    // Track block comment state across lines
    if (inBlockComment) {
      const endIdx = trimmed.indexOf('*/');
      if (endIdx !== -1) {
        inBlockComment = false;
        const afterComment = trimmed.slice(endIdx + 2);
        findRefs(afterComment, refs);
      }
      return;
    }

    // Track state within a single line
    let inString = false;
    let stringChar = '';
    let inQuotedId = false;
    let quotedIdChar = '';
    let inLineComment = false;

    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      const next = line[i + 1] ?? '';

      if (inLineComment) {
        break;
      }
      if (inString) {
        if (ch === '\\') {
          i += 1;
        } else if (ch === stringChar) {
          inString = false;
        }
      } else if (inQuotedId) {
        if (ch === '\\') {
          i += 1;
        } else if (ch === quotedIdChar) {
          inQuotedId = false;
        }
      } else if (ch === '-' && next === '-') {
        inLineComment = true;
        i += 1;
      } else if (ch === '/' && next === '*') {
        inBlockComment = true;
        i += 1;
      } else if (ch === "'") {
        inString = true;
        stringChar = ch;
      } else if (ch === '"' || ch === '`') {
        inQuotedId = true;
        quotedIdChar = ch;
      } else if (ch === '{' && next === '{') {
        const endIdx = line.indexOf('}}', i + 2);
        if (endIdx !== -1) {
          const refName = line.slice(i + 2, endIdx).trim();
          if (refName && /^\w+$/.test(refName)) {
            refs.add(refName);
          }
          i = endIdx + 1;
        }
      }
    }
  });

  return Array.from(refs);
}

/**
 * Build a dependency graph from a markdown page's SQL blocks.
 * Returns a topologically sorted execution order for the query blocks.
 *
 * @throws If a circular dependency is detected.
 * @throws If a referenced query does not exist.
 */
export function buildQueryDependencyGraph(markdownContent: string): {
  graph: QueryDependencyGraph;
  sqlBlocks: Array<{ name: string; sql: string }>;
} {
  const blocks = parseAnalyticsMarkdown(markdownContent);
  const sqlBlocks = blocks.filter(
    (b): b is SqlAnalyticsBlock => b.type === 'sql',
  );

  const blockNames = new Set(sqlBlocks.map((b) => b.name));
  const edges: Array<{ from: string; to: string }> = [];
  const nodes: string[] = sqlBlocks.map((b) => b.name);

  sqlBlocks.forEach((block) => {
    const refs = extractQueryReferences(block.sql);
    refs.forEach((ref) => {
      if (ref === block.name) {
        throw new Error(
          `Self-referencing query "${ref}" — query "${block.name}" references itself via {{${ref}}}`,
        );
      }
      if (!blockNames.has(ref)) {
        throw new Error(
          `Missing query reference: "${block.name}" references {{${ref}}}, but no SQL block named "${ref}" exists on this page`,
        );
      }
      edges.push({ from: ref, to: block.name });
    });
  });

  // Topological sort (Kahn's algorithm)
  const inDegree: Record<string, number> = {};
  const adjacency: Record<string, string[]> = {};

  nodes.forEach((node) => {
    inDegree[node] = 0;
    adjacency[node] = [];
  });

  edges.forEach((edge) => {
    adjacency[edge.from] = adjacency[edge.from] ?? [];
    adjacency[edge.from].push(edge.to);
    inDegree[edge.to] = (inDegree[edge.to] ?? 0) + 1;
  });

  const queue: string[] = nodes.filter((n) => (inDegree[n] ?? 0) === 0);
  const topoOrder: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    topoOrder.push(node);
    (adjacency[node] ?? []).forEach((neighbor) => {
      inDegree[neighbor] = (inDegree[neighbor] ?? 0) - 1;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    });
  }

  if (topoOrder.length !== nodes.length) {
    const remaining = nodes.filter((n) => !topoOrder.includes(n));
    throw new Error(
      `Circular dependency detected among queries: ${remaining.join(', ')}`,
    );
  }

  // Resolve references in dependency order so referenced queries are available
  // before dependents that inline them.
  const blockMap = new Map(sqlBlocks.map((b) => [b.name, b.sql]));
  const resolvedSqlByBlock = new Map<string, string>();

  topoOrder.forEach((name) => {
    const rawSql = blockMap.get(name) ?? '';
    let resolvedSql = rawSql;
    const refs = extractQueryReferences(rawSql);
    refs.forEach((ref) => {
      const refSql = resolvedSqlByBlock.get(ref);
      if (refSql !== undefined) {
        resolvedSql = resolvedSql.replace(
          new RegExp(`\\{\\{${ref}\\}\\}`, 'g'),
          `(${refSql})`,
        );
      }
    });
    resolvedSqlByBlock.set(name, resolvedSql);
  });

  // Build resolved blocks in topo order
  const resolvedBlocks = topoOrder
    .map((name) => ({
      name,
      sql: resolvedSqlByBlock.get(name) ?? '',
    }))
    .filter((b) => blockMap.has(b.name));

  return {
    graph: { nodes, edges, topoOrder },
    sqlBlocks: resolvedBlocks,
  };
}

/**
 * Validate that all {{query_name}} references in SQL blocks resolve to existing blocks.
 * Returns validation errors rather than throwing.
 */
export function validateQueryReferences(
  markdownContent: string,
): Array<{ blockName: string; error: string }> {
  const errors: Array<{ blockName: string; error: string }> = [];
  const blocks = parseAnalyticsMarkdown(markdownContent);
  const sqlBlocks = blocks.filter(
    (b): b is SqlAnalyticsBlock => b.type === 'sql',
  );
  const blockNames = new Set(sqlBlocks.map((b) => b.name));

  sqlBlocks.forEach((block) => {
    const refs = extractQueryReferences(block.sql);
    refs.forEach((ref) => {
      if (ref === block.name) {
        errors.push({
          blockName: block.name,
          error: `Self-referencing: query "${block.name}" references itself via {{${ref}}}`,
        });
      } else if (!blockNames.has(ref)) {
        errors.push({
          blockName: block.name,
          error: `Missing reference: "{{${ref}}}" — no SQL block named "${ref}" found`,
        });
      }
    });
  });

  return errors;
}
