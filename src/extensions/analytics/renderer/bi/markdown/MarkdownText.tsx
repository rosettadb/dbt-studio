/**
 * Renders a markdown node. Inline values and inline components were replaced
 * by `<span data-bi-slot="N">` placeholders in the parser; they are swapped
 * back in here so `{orders[0].total}` and `<Value />` work inside sentences,
 * list items and tables.
 */
import React from 'react';
import { Typography } from '@mui/material';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { MarkdownNode } from '../../../../../extensionApi/studio/analyticsBi';
import { markdownComponents } from './markdownComponents';

const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    span: [...((defaultSchema.attributes?.span as any[]) ?? []), 'dataBiSlot'],
  },
};

type RenderSlot = (index: number) => React.ReactNode;

const SlotContext = React.createContext<RenderSlot>(() => null);

/** `<span>` override: fills slot placeholders, leaves other spans alone. */
const SlotSpan: React.FC<{
  node?: any;
  children?: React.ReactNode;
  className?: string;
}> = ({ node, children, className }) => {
  const renderSlot = React.useContext(SlotContext);
  const slot = node?.properties?.dataBiSlot;
  if (slot !== undefined && slot !== null) {
    return <>{renderSlot(Number(slot))}</>;
  }
  return <span className={className}>{children}</span>;
};

// Dashboard section headings get more room above them than in prose.
const DashboardH2: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Typography variant="h5" fontWeight={600} sx={{ mt: 4, mb: 1.5 }}>
    {children}
  </Typography>
);

const DashboardH3: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Typography variant="h6" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
    {children}
  </Typography>
);

const components: Components = {
  ...markdownComponents,
  h2: DashboardH2 as any,
  h3: DashboardH3 as any,
  span: SlotSpan as any,
};

export interface MarkdownTextProps {
  node: MarkdownNode;
  renderSlot: RenderSlot;
}

export const MarkdownText: React.FC<MarkdownTextProps> = ({
  node,
  renderSlot,
}) => (
  <SlotContext.Provider value={renderSlot}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeHighlight,
        rehypeRaw,
        [rehypeSanitize, sanitizeSchema],
      ]}
      components={components}
    >
      {node.source}
    </ReactMarkdown>
  </SlotContext.Provider>
);
