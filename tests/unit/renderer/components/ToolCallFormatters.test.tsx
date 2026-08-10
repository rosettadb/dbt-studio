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

  it('renders pipeline reads without exposing YAML or content hashes', () => {
    render(
      <>
        {renderArguments('studio_pipeline_read', {
          path: 'rosetta/pipelines/nightly.yml',
        })}
        {renderResult('studio_pipeline_read', {
          success: true,
          path: 'rosetta/pipelines/nightly.yml',
          bytes: 128,
          valid: true,
          content: 'name: secret-pipeline',
          contentHash: 'a'.repeat(64),
          issues: [],
          warnings: [],
        })}
      </>,
    );

    expect(
      screen.getAllByText(/rosetta\/pipelines\/nightly\.yml/u),
    ).toHaveLength(2);
    expect(screen.getByText(/128 bytes.*valid/u)).toBeTruthy();
    expect(screen.queryByText(/secret-pipeline/u)).toBeNull();
    expect(screen.queryByText('a'.repeat(64))).toBeNull();
  });

  it('bounds pipeline lists and validation diagnostics', () => {
    render(
      <>
        {renderResult('studio_pipeline_list', {
          success: true,
          count: 24,
          pipelines: Array.from({ length: 24 }, (_, index) => ({
            path: `rosetta/pipelines/${index}.yml`,
          })),
        })}
        {renderResult('studio_pipeline_update', {
          success: false,
          code: 'INVALID_PIPELINE',
          error: 'Pipeline validation failed',
          issues: Array.from({ length: 8 }, (_, index) => ({
            message: `Issue ${index}`,
          })),
        })}
      </>,
    );

    expect(screen.getByText('More pipelines omitted')).toBeTruthy();
    expect(screen.queryByText('rosetta/pipelines/20.yml')).toBeNull();
    expect(screen.getByText('More diagnostics omitted')).toBeTruthy();
    expect(screen.queryByText('Issue 5')).toBeNull();
  });

  it('renders stale pipeline updates concisely', () => {
    render(
      <>
        {renderResult('studio_pipeline_update', {
          success: false,
          code: 'STALE_CONTENT',
          error: 'Pipeline changed since it was read',
          stale: true,
        })}
      </>,
    );

    expect(
      screen.getByText(/Pipeline changed since it was read/u),
    ).toBeTruthy();
  });
});
