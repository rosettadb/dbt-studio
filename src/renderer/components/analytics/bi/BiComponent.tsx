/**
 * Renders one component tag: resolves its attributes, waits for its data,
 * shows attribute warnings in the editor, and dispatches to the registry.
 */
import React from 'react';
import { Box } from '@mui/material';
import {
  canonicalComponentName,
  ComponentNode,
  componentPropIssues,
  getComponentSpec,
} from './engine';
import { useBiPage, useBiScope } from './context';
import { asRows, resolveComponent } from './props';
import {
  AwaitingQuery,
  ComponentError,
  LoadingQuery,
  PropWarnings,
} from './ui/placeholders';
import { BI_COMPONENTS } from './registry';

export const BiComponent: React.FC<{
  node: ComponentNode;
  inline?: boolean;
}> = ({ node, inline = false }) => {
  const page = useBiPage();
  const locals = useBiScope();
  const spec = getComponentSpec(node.tag);

  if (!spec) {
    return (
      <ComponentError
        message={`Unknown component: <${node.tag} />`}
        inline={inline}
      />
    );
  }
  const canonical = canonicalComponentName(node.tag)!;
  const Impl = BI_COMPONENTS[canonical];
  if (!Impl) {
    return (
      <ComponentError
        message={`<${node.tag}> is not supported here`}
        inline={inline}
      />
    );
  }

  if (spec.parent && !inline) {
    // Children like <Tab> or <Column> are rendered by their parent.
    return null;
  }

  const resolved = resolveComponent(node, page, locals);
  const warnings = page.showWarnings
    ? [
        ...componentPropIssues(node).map((issue) => issue.message),
        ...resolved.propErrors,
      ]
    : resolved.propErrors;

  const needsData = spec.props.some((p) => p.name === 'data' && p.required);
  const waitFor =
    resolved.dataQuery && resolved.data === undefined
      ? resolved.dataQuery
      : resolved.waitingOn[0];

  if (waitFor && (needsData || resolved.waitingOn.length > 0)) {
    const status = page.statuses[waitFor];
    if (status === 'running')
      return <LoadingQuery queryName={waitFor} inline={inline} />;
    if (status === 'error') {
      return (
        <ComponentError
          message={`${waitFor}: ${page.errors[waitFor] ?? 'query failed'}`}
          inline={inline}
        />
      );
    }
    if (inline) return <LoadingQuery queryName={waitFor} inline />;
    return (
      <AwaitingQuery
        queryName={waitFor}
        onRun={() => page.onRunQuery?.(waitFor)}
      />
    );
  }

  let rows: Record<string, unknown>[] | undefined;
  if (needsData) {
    if (!Object.prototype.hasOwnProperty.call(resolved.props, 'data')) {
      return (
        <ComponentError
          message={`<${spec.name}> needs data={query_name}`}
          inline={inline}
        />
      );
    }
    rows = asRows(resolved.data);
    if (!rows) {
      const source = node.props.find((p) => p.name === 'data');
      let text = '';
      if (source?.value.kind === 'expr') text = source.value.source;
      else if (source?.value.kind === 'string') text = source.value.value;
      return (
        <ComponentError
          message={`<${spec.name}> data={${text}}: no SQL block with that name`}
          inline={inline}
        />
      );
    }
  } else if (resolved.data !== undefined) {
    rows = asRows(resolved.data);
  }

  const body = (
    <Impl
      node={node}
      tag={canonical}
      props={resolved.props}
      data={rows}
      dataQuery={resolved.dataQuery}
      inline={inline}
    />
  );

  if (inline || warnings.length === 0) {
    return body;
  }
  return (
    <Box data-testid={`bi-${canonical}`}>
      <PropWarnings messages={warnings} />
      {body}
    </Box>
  );
};
