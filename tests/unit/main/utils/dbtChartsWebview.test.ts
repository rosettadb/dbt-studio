import { shell } from 'electron';
import {
  guardBoardRedirect,
  isBoardUrl,
  nextZoomLevel,
  zoomActionFor,
} from '../../../../src/main/utils/dbtChartsWebview';

const key = (
  k: string,
  mods: Partial<{ meta: boolean; control: boolean; alt: boolean }> = {},
  type: 'keyDown' | 'keyUp' = 'keyDown',
) => ({
  type,
  key: k,
  meta: false,
  control: false,
  alt: false,
  ...mods,
});

describe('zoomActionFor', () => {
  it('maps Cmd = / + / - / _ / 0 on macOS', () => {
    expect(zoomActionFor(key('=', { meta: true }), 'darwin')).toBe('in');
    expect(zoomActionFor(key('+', { meta: true }), 'darwin')).toBe('in');
    expect(zoomActionFor(key('-', { meta: true }), 'darwin')).toBe('out');
    expect(zoomActionFor(key('_', { meta: true }), 'darwin')).toBe('out');
    expect(zoomActionFor(key('0', { meta: true }), 'darwin')).toBe('reset');
  });

  it('uses Ctrl on Windows and Linux', () => {
    expect(zoomActionFor(key('=', { control: true }), 'win32')).toBe('in');
    expect(zoomActionFor(key('-', { control: true }), 'linux')).toBe('out');
    expect(zoomActionFor(key('=', { meta: true }), 'win32')).toBeNull();
    expect(zoomActionFor(key('=', { control: true }), 'darwin')).toBeNull();
  });

  it('ignores plain keys, key up, Alt and other shortcuts', () => {
    expect(zoomActionFor(key('='), 'darwin')).toBeNull();
    expect(zoomActionFor(key('=', { meta: true }, 'keyUp'), 'darwin')).toBe(
      null,
    );
    expect(
      zoomActionFor(key('=', { meta: true, alt: true }), 'darwin'),
    ).toBeNull();
    expect(zoomActionFor(key('s', { meta: true }), 'darwin')).toBeNull();
  });
});

describe('nextZoomLevel', () => {
  it('steps by 0.5 and resets to 0', () => {
    expect(nextZoomLevel(0, 'in')).toBe(0.5);
    expect(nextZoomLevel(0.5, 'out')).toBe(0);
    expect(nextZoomLevel(-1, 'out')).toBe(-1.5);
    expect(nextZoomLevel(2, 'reset')).toBe(0);
  });
});

describe('isBoardUrl', () => {
  const origin = 'http://127.0.0.1:8765';

  it('accepts pages on the running server', () => {
    expect(isBoardUrl('http://127.0.0.1:8765/sales/', origin)).toBe(true);
    expect(isBoardUrl('http://127.0.0.1:8765/', origin)).toBe(true);
  });

  it('rejects other ports, hosts and schemes', () => {
    expect(isBoardUrl('http://127.0.0.1:9999/', origin)).toBe(false);
    expect(isBoardUrl('http://localhost:8765/', origin)).toBe(false);
    expect(isBoardUrl('https://example.com/', origin)).toBe(false);
    expect(isBoardUrl('file:///etc/passwd', origin)).toBe(false);
    expect(isBoardUrl('not a url', origin)).toBe(false);
  });

  it('rejects everything when no server runs', () => {
    expect(isBoardUrl('http://127.0.0.1:8765/', null)).toBe(false);
  });
});

describe('guardBoardRedirect', () => {
  const origin = 'http://127.0.0.1:8765';
  const openExternal = shell.openExternal as jest.Mock;
  const redirect = (url: string, isMainFrame = true) => ({
    url,
    isMainFrame,
    preventDefault: jest.fn(),
  });

  beforeEach(() => {
    openExternal.mockReset();
    openExternal.mockResolvedValue(undefined);
  });

  it('keeps same-origin redirects in the board', () => {
    const details = redirect('http://127.0.0.1:8765/sales/');
    guardBoardRedirect(details, origin);
    expect(details.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('cancels a redirect to another origin and opens it outside', () => {
    const details = redirect('https://example.com/report');
    guardBoardRedirect(details, origin);
    expect(details.preventDefault).toHaveBeenCalled();
    expect(openExternal).toHaveBeenCalledWith('https://example.com/report');
  });

  it('cancels a redirect to a non-web URL without opening it', () => {
    const details = redirect('file:///etc/passwd');
    guardBoardRedirect(details, origin);
    expect(details.preventDefault).toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('cancels every redirect when no server runs', () => {
    const details = redirect('http://127.0.0.1:8765/sales/');
    guardBoardRedirect(details, null);
    expect(details.preventDefault).toHaveBeenCalled();
  });

  it('leaves redirects inside frames of the board alone', () => {
    const details = redirect('https://example.com/embed', false);
    guardBoardRedirect(details, origin);
    expect(details.preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });
});
