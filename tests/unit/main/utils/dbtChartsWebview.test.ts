import {
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
