/* eslint-disable no-use-before-define -- NodeList and its blocks render each other recursively */
/**
 * Renders a list of page nodes: markdown (with inline values), SQL badges,
 * components and {#if} / {#each} logic.
 */
import React, { useCallback, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  canonicalComponentName,
  collectRootIdentifiersOf,
  ComponentNode,
  ExpressionSyntaxError,
  formatDateDefault,
  formatValue,
  isDateLike,
  EachNode,
  IfNode,
  MarkdownNode,
  PageNode,
  tryEvaluate,
} from './engine';
import { BiScopeContext, buildScope, useBiPage, useBiScope } from './context';
import { MarkdownText } from './markdown/MarkdownText';
import { ComponentError, LoadingQuery, SqlBadge } from './ui/placeholders';
import { BiComponent } from './BiComponent';

const MAX_EACH_ITEMS = 1000;

/** Queries an expression reads that have no results yet. */
function pendingQueries(
  source: string,
  queryNames: Set<string>,
  results: Record<string, any[]>,
  locals: Record<string, unknown>,
): string[] {
  return collectRootIdentifiersOf(source).filter(
    (name) =>
      queryNames.has(name) && !(name in locals) && results[name] === undefined,
  );
}

const InlineExpression: React.FC<{ source: string; raw: string }> = ({
  source,
  raw,
}) => {
  const page = useBiPage();
  const locals = useBiScope();
  const pending = pendingQueries(source, page.queryNames, page.results, locals);
  if (pending.length > 0) {
    const running = pending.some((q) => page.statuses[q] === 'running');
    return running ? (
      <LoadingQuery queryName={pending[0]} inline />
    ) : (
      <Typography component="span" variant="body2" color="text.disabled">
        …
      </Typography>
    );
  }
  const result = tryEvaluate(source, buildScope(page, locals));
  if (!result.ok) {
    // Unknown names or text that isn't an expression: plain text with braces.
    if (
      result.unknownIdentifier ||
      result.error instanceof ExpressionSyntaxError
    ) {
      return <span>{raw}</span>;
    }
    return (
      <ComponentError message={`{${source}}: ${result.error.message}`} inline />
    );
  }
  const { value } = result;
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return <>{formatValue(value)}</>;
  if (typeof value === 'object') return <>{formatValue(value)}</>;
  if (isDateLike(value)) {
    const text = formatDateDefault(value) ?? String(value);
    return <span>{text}</span>;
  }
  return <>{String(value)}</>;
};

const MarkdownBlock: React.FC<{ node: MarkdownNode }> = ({ node }) => {
  const renderSlot = useCallback(
    (index: number) => {
      const slot = node.slots[index];
      if (!slot) return null;
      if (slot.kind === 'expr')
        return <InlineExpression source={slot.source} raw={slot.raw} />;
      return <BiComponent node={slot.node} inline />;
    },
    [node],
  );
  return <MarkdownText node={node} renderSlot={renderSlot} />;
};

const IfBlock: React.FC<{ node: IfNode }> = ({ node }) => {
  const page = useBiPage();
  const locals = useBiScope();
  const scope = buildScope(page, locals);
  for (let i = 0; i < node.branches.length; i += 1) {
    const branch = node.branches[i];
    if (branch.condition === undefined) {
      return <NodeList nodes={branch.children} />;
    }
    if (
      pendingQueries(branch.condition, page.queryNames, page.results, locals)
        .length > 0
    ) {
      // Don't guess a branch before the data is there.
      return null;
    }
    const result = tryEvaluate(branch.condition, scope);
    if (!result.ok) {
      return (
        <ComponentError
          message={`{#if ${branch.condition}}: ${result.error.message}`}
        />
      );
    }
    if (result.value) return <NodeList nodes={branch.children} />;
  }
  return null;
};

const EachBlock: React.FC<{ node: EachNode }> = ({ node }) => {
  const page = useBiPage();
  const locals = useBiScope();
  if (
    pendingQueries(node.expr, page.queryNames, page.results, locals).length > 0
  ) {
    return null;
  }
  const result = tryEvaluate(node.expr, buildScope(page, locals));
  if (!result.ok) {
    return (
      <ComponentError
        message={`{#each ${node.expr}}: ${result.error.message}`}
      />
    );
  }
  if (!Array.isArray(result.value)) {
    return <ComponentError message={`{#each ${node.expr}}: not a list`} />;
  }
  const items = result.value.slice(0, MAX_EACH_ITEMS);
  return (
    <>
      {items.map((item, index) => (
        <EachItem
          // eslint-disable-next-line react/no-array-index-key
          key={index}
          node={node}
          item={item}
          index={index}
          locals={locals}
        />
      ))}
    </>
  );
};

const EachItem: React.FC<{
  node: EachNode;
  item: unknown;
  index: number;
  locals: Record<string, unknown>;
}> = ({ node, item, index, locals }) => {
  const scope = useMemo(
    () => ({
      ...locals,
      [node.item]: item,
      ...(node.index ? { [node.index]: index } : {}),
    }),
    [locals, node.item, node.index, item, index],
  );
  return (
    <BiScopeContext.Provider value={scope}>
      <NodeList nodes={node.children} />
    </BiScopeContext.Provider>
  );
};

const SqlBlock: React.FC<{ name: string; sql: string }> = ({ name, sql }) => {
  const page = useBiPage();
  // Dashboards don't show their SQL; the editor toolbar lists query status.
  if (!page.showQueries) return null;
  return (
    <SqlBadge
      block={{ name, sql }}
      status={page.statuses[name] ?? 'idle'}
      rowCount={page.results[name]?.length}
      error={page.errors[name]}
      duration={page.durations[name]}
      onRun={(queryName) => page.onRunQuery?.(queryName)}
    />
  );
};

const INPUT_TAGS = new Set([
  'Dropdown',
  'ButtonGroup',
  'DateRange',
  'TextInput',
  'NumberInput',
  'Checkbox',
  'Slider',
]);

type Group =
  | { kind: 'node'; node: PageNode; index: number }
  | { kind: 'kpis' | 'filters'; nodes: ComponentNode[]; index: number };

/** Lay consecutive KPI tiles out as one row and consecutive filters as one bar. */
function groupNodes(nodes: PageNode[], showQueries: boolean): Group[] {
  const groups: Group[] = [];
  nodes.forEach((node, index) => {
    let kind: 'kpis' | 'filters' | null = null;
    if (node.type === 'component') {
      const name = canonicalComponentName(node.tag);
      if (name === 'BigValue') kind = 'kpis';
      else if (name && INPUT_TAGS.has(name)) kind = 'filters';
    }
    const last = groups[groups.length - 1];
    if (kind && last && last.kind === kind) {
      last.nodes.push(node as ComponentNode);
    } else if (kind) {
      groups.push({ kind, nodes: [node as ComponentNode], index });
    } else if (node.type === 'sql' && !showQueries) {
      // Hidden SQL blocks don't break a row of tiles or filters.
      if (last && last.kind !== 'node') return;
      groups.push({ kind: 'node', node, index });
    } else {
      groups.push({ kind: 'node', node, index });
    }
  });
  return groups;
}

const KpiRow: React.FC<{ nodes: ComponentNode[] }> = ({ nodes }) => (
  <Box
    data-testid="bi-kpi-row"
    sx={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
      gap: 2,
      mb: 2,
    }}
  >
    {nodes.map((node, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <BiComponent key={i} node={node} />
    ))}
  </Box>
);

const FilterBar: React.FC<{ nodes: ComponentNode[] }> = ({ nodes }) => (
  <Box
    data-testid="bi-filter-bar"
    sx={{
      display: 'flex',
      flexWrap: 'wrap',
      alignItems: 'flex-start',
      columnGap: 3,
      rowGap: 1.5,
      mb: 2,
    }}
  >
    {nodes.map((node, i) => (
      // eslint-disable-next-line react/no-array-index-key
      <BiComponent key={i} node={node} />
    ))}
  </Box>
);

const renderNode = (node: PageNode, key: string) => {
  switch (node.type) {
    case 'markdown':
      return <MarkdownBlock key={key} node={node} />;
    case 'sql':
      return <SqlBlock key={key} name={node.name} sql={node.sql} />;
    case 'component':
      return <BiComponent key={key} node={node as ComponentNode} />;
    case 'if':
      return <IfBlock key={key} node={node} />;
    case 'each':
      return <EachBlock key={key} node={node} />;
    default:
      return null;
  }
};

export const NodeList: React.FC<{ nodes: PageNode[] }> = ({ nodes }) => {
  const page = useBiPage();
  const groups = useMemo(
    () => groupNodes(nodes, page.showQueries),
    [nodes, page.showQueries],
  );
  return (
    <>
      {groups.map((group) => {
        // Index keys are stable here: the list is re-created from the source.
        const key = `${group.kind}-${group.index}`;
        if (group.kind !== 'node') {
          return group.kind === 'kpis' ? (
            <KpiRow key={key} nodes={group.nodes} />
          ) : (
            <FilterBar key={key} nodes={group.nodes} />
          );
        }
        if (group.node.type === 'sql' && !page.showQueries) return null;
        return renderNode(group.node, key);
      })}
    </>
  );
};
