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

    // Cap to 80% of the work area, with hard limits so the window isn't
    // enormous on large/4K displays. Center it on the primary screen.
    // 1920x1080 is the suggested sweet spot for large monitors.
    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;
    const MIN_WIDTH = 1024;
    const MIN_HEIGHT = 768;

    const windowWidth = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, Math.round(primaryWidth * 0.8)),
    );
    const windowHeight = Math.min(
      MAX_HEIGHT,
      Math.max(MIN_HEIGHT, Math.round(primaryHeight * 0.8)),
    );

    const { x: displayX, y: displayY } = screen.getPrimaryDisplay().workArea;
    const centeredX = displayX + Math.round((primaryWidth - windowWidth) / 2);
    const centeredY = displayY + Math.round((primaryHeight - windowHeight) / 2);

    return {
      width: windowWidth,
      height: windowHeight,
      x: centeredX,
      y: centeredY,
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
