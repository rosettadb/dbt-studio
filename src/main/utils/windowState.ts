import { BrowserWindow, screen } from 'electron';
import Store from 'electron-store';

type WindowStateSchema = {
  width: number;
  height: number;
  x: number | null;
  y: number | null;
  isMaximized: boolean;
};

const DEFAULTS: WindowStateSchema = {
  width: 0,
  height: 0,
  x: null,
  y: null,
  isMaximized: false,
};

const SAVE_DEBOUNCE_MS = 300;

export type InitialWindowBounds = {
  width: number;
  height: number;
  x?: number;
  y?: number;
  isMaximized: boolean;
};

const isVisibleOnAnyDisplay = (
  x: number,
  y: number,
  width: number,
  height: number,
): boolean =>
  screen.getAllDisplays().some(({ workArea }) => {
    return (
      x >= workArea.x &&
      y >= workArea.y &&
      x + width <= workArea.x + workArea.width &&
      y + height <= workArea.y + workArea.height
    );
  });

// Tracks a BrowserWindow's size/position/maximized state across app
// restarts. Bounds are only persisted while un-maximized (matching how
// electron-window-state-style helpers behave) so restoring never "sticks"
// a maximized window's full-screen dimensions as its normal size.
export const createWindowStateKeeper = (storeName: string) => {
  const store = new Store<WindowStateSchema>({
    name: storeName,
    defaults: DEFAULTS,
  });

  const getInitialBounds = (): InitialWindowBounds => {
    const width = store.get('width');
    const height = store.get('height');
    const x = store.get('x');
    const y = store.get('y');
    const isMaximized = store.get('isMaximized');
    const { width: primaryWidth, height: primaryHeight } =
      screen.getPrimaryDisplay().workAreaSize;

    if (
      width &&
      height &&
      typeof x === 'number' &&
      typeof y === 'number' &&
      isVisibleOnAnyDisplay(x, y, width, height)
    ) {
      return { width, height, x, y, isMaximized };
    }

    return {
      width: primaryWidth,
      height: primaryHeight,
      isMaximized,
    };
  };

  const track = (window: BrowserWindow) => {
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;

    const save = () => {
      if (window.isDestroyed()) return;
      const isMaximized = window.isMaximized();
      store.set('isMaximized', isMaximized);

      if (!isMaximized && !window.isMinimized() && !window.isFullScreen()) {
        const bounds = window.getBounds();
        store.set('width', bounds.width);
        store.set('height', bounds.height);
        store.set('x', bounds.x);
        store.set('y', bounds.y);
      }
    };

    const debouncedSave = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(save, SAVE_DEBOUNCE_MS);
    };

    window.on('resize', debouncedSave);
    window.on('move', debouncedSave);
    window.on('maximize', save);
    window.on('unmaximize', save);
    window.on('close', save);
  };

  return { getInitialBounds, track };
};
