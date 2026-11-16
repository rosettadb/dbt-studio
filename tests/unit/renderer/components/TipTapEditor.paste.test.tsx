import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { TipTapEditor } from '../../../../src/renderer/components/chat/TipTapEditor';

// jsdom has no layout, but ProseMirror measures the caret to scroll it into
// view after a paste. Give it empty rects so the transaction can finish.
const emptyRect = {
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  width: 0,
  height: 0,
  toJSON: () => ({}),
} as DOMRect;

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => emptyRect;
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  if (!document.elementFromPoint) {
    document.elementFromPoint = () => null;
  }
});

// jsdom has no ClipboardEvent/DataTransfer, so build a paste event by hand.
const paste = (target: Element, data: Record<string, string>) => {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => data[type] ?? '' },
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
};

const renderEditor = () => {
  const onChange = jest.fn();
  const { container } = render(<TipTapEditor value="" onChange={onChange} />);
  return { onChange, container };
};

const getProseMirror = async (container: HTMLElement) => {
  let editorDom: Element | null = null;
  await waitFor(() => {
    editorDom = container.querySelector('.ProseMirror');
    expect(editorDom).not.toBeNull();
  });
  return editorDom as unknown as HTMLElement;
};

describe('TipTapEditor paste (#634)', () => {
  it('inserts pasted text once', async () => {
    const { onChange, container } = renderEditor();
    const editorDom = await getProseMirror(container);

    const event = paste(editorDom, { 'text/plain': 'select * from orders' });

    expect(event.defaultPrevented).toBe(true);
    expect(editorDom.textContent).toBe('select * from orders');
    expect(onChange).toHaveBeenLastCalledWith('<p>select * from orders</p>');
  });

  it('pastes rich content as plain text', async () => {
    const { onChange, container } = renderEditor();
    const editorDom = await getProseMirror(container);

    paste(editorDom, {
      'text/plain': 'Revenue report',
      'text/html': '<h1><strong>Revenue</strong> report</h1>',
    });

    expect(editorDom.textContent).toBe('Revenue report');
    expect(onChange).toHaveBeenLastCalledWith('<p>Revenue report</p>');
  });

  it('keeps line breaks and normalizes Windows line endings', async () => {
    const { onChange, container } = renderEditor();
    const editorDom = await getProseMirror(container);

    paste(editorDom, { 'text/plain': 'line one\r\nline two' });

    expect(editorDom.textContent).toBe('line one\nline two');
    expect(onChange).toHaveBeenLastCalledWith('<p>line one\nline two</p>');
  });

  it('keeps HTML-looking text literally', async () => {
    const { onChange, container } = renderEditor();
    const editorDom = await getProseMirror(container);

    paste(editorDom, { 'text/plain': '<div>{{ ref("orders") }}</div>' });

    expect(editorDom.textContent).toBe('<div>{{ ref("orders") }}</div>');
    expect(onChange).toHaveBeenLastCalledWith(
      '<p>&lt;div&gt;{{ ref("orders") }}&lt;/div&gt;</p>',
    );
  });
});

describe('TipTapEditor pasted value round trip', () => {
  // Paste into a fresh editor and return the HTML value it emits.
  const pastedValue = async (text: string) => {
    const onChange = jest.fn();
    const { container, unmount } = render(
      <TipTapEditor value="" onChange={onChange} />,
    );
    paste(await getProseMirror(container), { 'text/plain': text });
    const value = onChange.mock.lastCall?.[0] as string;
    unmount();
    return value;
  };

  it('keeps pasted line breaks when the value is loaded on mount', async () => {
    const value = await pastedValue('line one\r\nline two\n\nline four');

    const { container } = render(<TipTapEditor value={value} />);
    const editorDom = await getProseMirror(container);

    expect(editorDom.textContent).toBe('line one\nline two\n\nline four');
  });

  it('keeps pasted line breaks when the value is set after mount', async () => {
    const value = await pastedValue('line one\nline two');
    const onChange = jest.fn();

    const { container, rerender } = render(
      <TipTapEditor value="" onChange={onChange} />,
    );
    const editorDom = await getProseMirror(container);
    act(() => {
      rerender(<TipTapEditor value={value} onChange={onChange} />);
    });

    expect(editorDom.textContent).toBe('line one\nline two');
    expect(onChange).toHaveBeenLastCalledWith(value);
  });

  it('still clears when the value is reset after a paste', async () => {
    const onChange = jest.fn();
    const { container, rerender } = render(
      <TipTapEditor value="" onChange={onChange} />,
    );
    const editorDom = await getProseMirror(container);
    paste(editorDom, { 'text/plain': 'line one\nline two' });
    const value = onChange.mock.lastCall?.[0] as string;
    act(() => {
      rerender(<TipTapEditor value={value} onChange={onChange} />);
    });

    act(() => {
      rerender(<TipTapEditor value="" onChange={onChange} />);
    });

    expect(editorDom.textContent).toBe('');
    expect(onChange).toHaveBeenLastCalledWith('<p></p>');
  });
});
