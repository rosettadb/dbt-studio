import {
  app,
  session,
  shell,
  webContents as allWebContents,
  type Input,
  type WebContents,
} from 'electron';
import { DBT_CHARTS_WEBVIEW_PARTITION } from '../../shared/dbtCharts';
import { getRunningServerOrigin } from './dbtChartsServer';

// Guards the dbt Charts board <webview> (ChartsPreviewPane), and only that
// one: it is recognised by its partition, so other webviews (the HTML
// preview) and the main window keep their current behaviour.
//
// - Attach: the board may only load the running `dct serve` origin, with no
//   preload and no Node.
// - Zoom: the View menu's zoom roles act on the focused page, so with focus
//   in the board Cmd +/-/0 zoomed only the board. Those keys are sent to
//   the Studio page instead, and the board is kept at Studio's zoom level.
// - Navigation: links and server redirects that leave the board server
//   open in the system browser; popups never open inside Studio.

export type ZoomAction = 'in' | 'out' | 'reset';

const ZOOM_STEP = 0.5; // Same step as Electron's zoomIn / zoomOut roles.

/** The zoom shortcut a key press is, if any (Cmd on macOS, Ctrl elsewhere). */
export const zoomActionFor = (
  input: Pick<Input, 'type' | 'key' | 'meta' | 'control' | 'alt'>,
  platform: string = process.platform,
): ZoomAction | null => {
  if (input.type !== 'keyDown' || input.alt) return null;
  const modifier = platform === 'darwin' ? input.meta : input.control;
  if (!modifier) return null;
  if (input.key === '=' || input.key === '+') return 'in';
  if (input.key === '-' || input.key === '_') return 'out';
  if (input.key === '0') return 'reset';
  return null;
};

export const nextZoomLevel = (current: number, action: ZoomAction): number => {
  if (action === 'reset') return 0;
  return current + (action === 'in' ? ZOOM_STEP : -ZOOM_STEP);
};

/** True when `url` is on the running board server's origin. */
export const isBoardUrl = (url: string, origin: string | null): boolean => {
  if (!origin) return false;
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
};

const isWebUrl = (url: string): boolean => {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
};

const openOutside = (url: string) => {
  if (isWebUrl(url)) shell.openExternal(url).catch(() => undefined);
};

/**
 * A server redirect of the board page (will-navigate doesn't see those):
 * same-origin redirects stay in the board; one to another origin is
 * cancelled and, for http(s), opened in the system browser.
 */
export const guardBoardRedirect = (
  details: { url: string; isMainFrame: boolean; preventDefault: () => void },
  origin: string | null,
) => {
  if (!details.isMainFrame || isBoardUrl(details.url, origin)) return;
  details.preventDefault();
  openOutside(details.url);
};

const isBoardGuest = (guest: WebContents): boolean => {
  try {
    return (
      guest.getType() === 'webview' &&
      guest.session === session.fromPartition(DBT_CHARTS_WEBVIEW_PARTITION)
    );
  } catch {
    return false;
  }
};

const guardGuest = (host: WebContents, guest: WebContents) => {
  const syncZoom = () => {
    if (!host.isDestroyed() && !guest.isDestroyed()) {
      guest.setZoomLevel(host.getZoomLevel());
    }
  };
  // dct's live reload reloads the page; keep each load at Studio's zoom.
  guest.on('did-finish-load', syncZoom);

  guest.on('before-input-event', (event, input) => {
    const action = zoomActionFor(input);
    if (!action || host.isDestroyed()) return;
    // Also stops the menu accelerator, so the board isn't zoomed on its own.
    event.preventDefault();
    host.setZoomLevel(nextZoomLevel(host.getZoomLevel(), action));
    syncZoom();
  });

  guest.on('will-navigate', (event, url) => {
    if (isBoardUrl(url, getRunningServerOrigin())) return;
    event.preventDefault();
    openOutside(url);
  });

  guest.on('will-redirect', (details) => {
    guardBoardRedirect(details, getRunningServerOrigin());
  });

  guest.setWindowOpenHandler(({ url }) => {
    if (!isBoardUrl(url, getRunningServerOrigin())) openOutside(url);
    return { action: 'deny' };
  });
};

const guarded = new WeakSet<WebContents>();

const guardHost = (host: WebContents) => {
  if (guarded.has(host) || host.getType() === 'webview') return;
  guarded.add(host);

  host.on('will-attach-webview', (event, webPreferences, params) => {
    if (params.partition !== DBT_CHARTS_WEBVIEW_PARTITION) return;
    if (!isBoardUrl(params.src, getRunningServerOrigin())) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
  });

  host.on('did-attach-webview', (_event, guest) => {
    if (isBoardGuest(guest)) guardGuest(host, guest);
  });
};

let installed = false;

/** Installs the board webview guard once (safe to call again). */
export const installDbtChartsWebviewGuard = () => {
  if (installed) return;
  installed = true;
  allWebContents.getAllWebContents().forEach(guardHost);
  app.on('web-contents-created', (_event, contents) => guardHost(contents));
};
