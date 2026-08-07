/* eslint-disable import/first */
import React from 'react';
import { render } from '@testing-library/react';

const reactMarkdown = jest.fn(({ children }) => <div>{children}</div>);
const sanitizePlugin = jest.fn();

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: (props: unknown) => reactMarkdown(props),
}));
jest.mock('remark-gfm', () => jest.fn());
jest.mock('rehype-raw', () => jest.fn());
jest.mock('rehype-highlight', () => jest.fn());
jest.mock('rehype-sanitize', () => sanitizePlugin);

import { MarkdownPreview } from '../../../../src/renderer/components/editor/markdownPreview';

describe('MarkdownPreview', () => {
  it('sanitizes raw HTML before highlighting stored Markdown', () => {
    render(<MarkdownPreview content="# Wiki Memory" />);

    expect(reactMarkdown).toHaveBeenCalledWith(
      expect.objectContaining({
        rehypePlugins: expect.arrayContaining([sanitizePlugin]),
      }),
    );
    const { rehypePlugins } = reactMarkdown.mock.calls[0][0];
    expect(rehypePlugins.indexOf(sanitizePlugin)).toBeLessThan(
      rehypePlugins.length - 1,
    );
  });
});
