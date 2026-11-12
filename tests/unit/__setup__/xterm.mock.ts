/* eslint-disable class-methods-use-this */
/**
 * Stand-in for `@xterm/xterm` in unit tests. The real bundle probes a canvas
 * 2D context while it loads, which jsdom does not implement, and components
 * that merely import the terminal panel registry do not need a terminal.
 * Tests of the shell session store inject their own terminal double.
 */
const disposable = () => ({ dispose: () => undefined });

export class Terminal {
  options: Record<string, unknown>;

  cols = 80;

  rows = 24;

  unicode = { activeVersion: '6' };

  buffer = { active: { length: 0, getLine: () => undefined } };

  constructor(options: Record<string, unknown> = {}) {
    this.options = { ...options };
  }

  loadAddon = () => undefined;

  open = () => undefined;

  refresh = () => undefined;

  focus = () => undefined;

  write = (_data: string, callback?: () => void) => callback?.();

  onData = disposable;

  onBinary = disposable;

  onResize = disposable;

  attachCustomKeyEventHandler = () => undefined;

  hasSelection = () => false;

  getSelection = () => '';

  clearSelection = () => undefined;

  selectAll = () => undefined;

  paste = () => undefined;

  clear = () => undefined;

  dispose = () => undefined;
}
