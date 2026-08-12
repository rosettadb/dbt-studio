import React from 'react';
import { render, screen } from '@testing-library/react';
import { ToolCallRow } from '../../../../src/renderer/components/chat/ToolCallRow';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);

describe('ToolCallRow pipeline presentation', () => {
  it('never mounts raw pipeline tool details', () => {
    render(
      <ToolCallRow
        isExpanded
        toolCall={{
          id: 'pipeline-read-1',
          toolName: 'studio_pipeline_read',
          status: 'done',
          args: { path: 'rosetta/pipelines/nightly.yml' },
          result: {
            success: true,
            path: 'rosetta/pipelines/nightly.yml',
            bytes: 42,
            valid: true,
            content: 'name: raw-secret-yaml',
            contentHash: 'b'.repeat(64),
            issues: [],
            warnings: [],
          },
        }}
      />,
    );

    expect(screen.getByText('Read pipeline')).toBeTruthy();
    expect(screen.queryByText(/raw-secret-yaml/u)).toBeNull();
    expect(screen.queryByText('b'.repeat(64))).toBeNull();
  });
});
