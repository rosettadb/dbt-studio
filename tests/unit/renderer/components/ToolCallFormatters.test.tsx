import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  renderArguments,
  renderResult,
} from '../../../../src/renderer/components/chat/ToolCallFormatters';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);

describe('ToolCallFormatters arguments', () => {
  it('renders persisted arguments for wiki and unknown tools', () => {
    render(
      <>
        {renderArguments('wiki_update', {
          pageId: 'projects/project-key/index.md',
          rationale: 'Document the active project',
        })}
      </>,
    );

    expect(screen.getByText(/projects\/project-key\/index\.md/u)).toBeTruthy();
    expect(screen.getByText(/Document the active project/u)).toBeTruthy();
  });

  it('states when a tool genuinely has no arguments', () => {
    render(<>{renderArguments('wiki_status', {})}</>);

    expect(screen.getByText('No arguments provided')).toBeTruthy();
  });

  it('renders a structured tool error message instead of object coercion', () => {
    render(
      <>
        {renderResult('wiki_read', {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Wiki Memory page not found.' },
        })}
      </>,
    );

    expect(
      screen.getByText('NOT_FOUND: Wiki Memory page not found.'),
    ).toBeTruthy();
    expect(screen.queryByText('[object Object]')).toBeNull();
  });
});
