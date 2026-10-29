import { copyText } from '../../../../src/renderer/lib/clipboard';

type CopyEvent = Event & { clipboardData: { setData: jest.Mock } | null };

describe('copyText', () => {
  const originalExecCommand = document.execCommand;
  let setData: jest.Mock;

  const fireCopy = (withClipboardData = true) => {
    const event = new Event('copy', { cancelable: true }) as CopyEvent;
    event.clipboardData = withClipboardData ? { setData } : null;
    document.dispatchEvent(event);
    return true;
  };

  beforeEach(() => {
    setData = jest.fn();
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
  });

  it('writes the text through the copy event and returns true', () => {
    document.execCommand = jest.fn(() => fireCopy());

    expect(copyText('/project/models/a.sql')).toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith('copy');
    expect(setData).toHaveBeenCalledWith('text/plain', '/project/models/a.sql');
  });

  it('works when focus is held elsewhere (no selection needed)', () => {
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.focus();
    document.execCommand = jest.fn(() => fireCopy());

    expect(copyText('select 1')).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(document.querySelector('textarea')).toBeNull();
    document.body.removeChild(button);
  });

  it('stops the event before an editor (e.g. Monaco) can overwrite it', () => {
    const editorTextarea = document.createElement('textarea');
    document.body.appendChild(editorTextarea);
    const editorCopyHandler = jest.fn((event: Event) => {
      (event as CopyEvent).clipboardData?.setData('text/plain', '\n');
    });
    editorTextarea.addEventListener('copy', editorCopyHandler);
    document.execCommand = jest.fn(() => {
      const event = new Event('copy', {
        bubbles: true,
        cancelable: true,
      }) as CopyEvent;
      event.clipboardData = { setData };
      editorTextarea.dispatchEvent(event);
      return true;
    });

    expect(copyText('my_postgres')).toBe(true);
    expect(editorCopyHandler).not.toHaveBeenCalled();
    expect(setData).toHaveBeenCalledTimes(1);
    expect(setData).toHaveBeenCalledWith('text/plain', 'my_postgres');
    document.body.removeChild(editorTextarea);
  });

  it('returns false when no copy event fires', () => {
    document.execCommand = jest.fn(() => false);
    expect(copyText('x')).toBe(false);
  });

  it('returns false when the event has no clipboardData', () => {
    document.execCommand = jest.fn(() => fireCopy(false));
    expect(copyText('x')).toBe(false);
  });

  it('returns false when execCommand throws', () => {
    document.execCommand = jest.fn(() => {
      throw new Error('not supported');
    });
    expect(copyText('x')).toBe(false);
  });

  it('removes its listener so later copies are untouched', () => {
    document.execCommand = jest.fn(() => fireCopy());
    copyText('first');
    setData.mockClear();
    fireCopy();
    expect(setData).not.toHaveBeenCalled();
  });
});
