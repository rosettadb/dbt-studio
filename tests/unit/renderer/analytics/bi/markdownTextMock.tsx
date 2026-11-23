/**
 * react-markdown ships ESM only, which this Jest setup doesn't transform.
 * Tests render markdown nodes as plain text with their slots filled in.
 */
import React from 'react';

export const MarkdownText = ({
  node,
  renderSlot,
}: {
  node: { source: string };
  renderSlot: (index: number) => React.ReactNode;
}) => {
  const parts = node.source.split(/<span data-bi-slot="(\d+)"><\/span>/);
  return (
    <div data-testid="md">
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          // eslint-disable-next-line react/no-array-index-key
          <React.Fragment key={i}>{renderSlot(Number(part))}</React.Fragment>
        ) : (
          // eslint-disable-next-line react/no-array-index-key
          <React.Fragment key={i}>{part}</React.Fragment>
        ),
      )}
    </div>
  );
};
