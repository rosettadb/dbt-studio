import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import { PythonTextCell } from '../../../../../src/renderer/components/notebook/python/PythonTextCell';

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock('remark-gfm', () => () => undefined);

const noop = () => undefined;

describe('PythonTextCell toolbar placement', () => {
  it('renders the formatting toolbar into the cell header when given one', () => {
    const header = document.createElement('div');
    document.body.appendChild(header);
    const onChange = jest.fn();

    render(
      <PythonTextCell
        source=""
        onChange={onChange}
        onRender={noop}
        onFocus={noop}
        toolbarContainer={header}
      />,
    );

    const toolbar = within(header).getByTestId('markdown-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(screen.getAllByTestId('markdown-toolbar')).toHaveLength(1);

    // Buttons still format the textarea from the header
    act(() => {
      fireEvent.click(within(header).getByTestId('markdown-format-bold'));
    });
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('**'));
    header.remove();
  });

  it('renders nothing while the header slot is still mounting', () => {
    render(
      <PythonTextCell
        source=""
        onChange={noop}
        onRender={noop}
        onFocus={noop}
        toolbarContainer={null}
      />,
    );
    expect(screen.queryByTestId('markdown-toolbar')).not.toBeInTheDocument();
  });

  it('keeps the toolbar above the textarea without a header slot', () => {
    const { container } = render(
      <PythonTextCell
        source=""
        onChange={noop}
        onRender={noop}
        onFocus={noop}
      />,
    );
    expect(
      within(container).getByTestId('markdown-toolbar'),
    ).toBeInTheDocument();
  });
});
