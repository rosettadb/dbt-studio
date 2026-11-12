import { alpha } from '@mui/material';
import type { Theme } from '@mui/material';
import type { ITheme } from '@xterm/xterm';
import type { ShellAppearance } from './shellSessions';

// The 16 ANSI colors programs ask for by number. Two sets, because colors
// picked for a dark background (bright yellow, white) are unreadable on a
// light one. Values follow the defaults of VS Code's integrated terminal.
const DARK_ANSI: ITheme = {
  black: '#000000',
  red: '#cd3131',
  green: '#0dbc79',
  yellow: '#e5e510',
  blue: '#2472c8',
  magenta: '#bc3fbc',
  cyan: '#11a8cd',
  white: '#e5e5e5',
  brightBlack: '#666666',
  brightRed: '#f14c4c',
  brightGreen: '#23d18b',
  brightYellow: '#f5f543',
  brightBlue: '#3b8eea',
  brightMagenta: '#d670d6',
  brightCyan: '#29b8db',
  brightWhite: '#ffffff',
};

const LIGHT_ANSI: ITheme = {
  black: '#000000',
  red: '#cd3131',
  green: '#107c10',
  yellow: '#949800',
  blue: '#0451a5',
  magenta: '#bc05bc',
  cyan: '#0598bc',
  white: '#555555',
  brightBlack: '#666666',
  brightRed: '#cd3131',
  brightGreen: '#14ce14',
  brightYellow: '#b5ba00',
  brightBlue: '#0451a5',
  brightMagenta: '#bc05bc',
  brightCyan: '#0598bc',
  brightWhite: '#a5a5a5',
};

/** Background shared with the other bottom panels (see ../styles.ts). */
export const shellBackground = (theme: Theme): string =>
  theme.palette.mode === 'dark'
    ? theme.palette.grey[900]
    : theme.palette.grey[50];

// The platform's standard terminal face first: Menlo/Monaco exist only on
// macOS, Consolas only on Windows, the DejaVu/Droid/Liberation families on
// Linux.
export const SHELL_FONT_FAMILY =
  'Menlo, Monaco, Consolas, "DejaVu Sans Mono", "Droid Sans Mono", "Liberation Mono", "Courier New", monospace';

export const SHELL_FONT_SIZE = 12;

export const buildShellAppearance = (theme: Theme): ShellAppearance => {
  const dark = theme.palette.mode === 'dark';
  const foreground = dark
    ? theme.palette.common.white
    : theme.palette.common.black;
  const background = shellBackground(theme);

  return {
    fontFamily: SHELL_FONT_FAMILY,
    fontSize: SHELL_FONT_SIZE,
    theme: {
      ...(dark ? DARK_ANSI : LIGHT_ANSI),
      background,
      foreground,
      cursor: foreground,
      cursorAccent: background,
      selectionBackground: alpha(theme.palette.primary.main, 0.35),
      selectionInactiveBackground: alpha(theme.palette.primary.main, 0.2),
      scrollbarSliderBackground: alpha(foreground, 0.2),
      scrollbarSliderHoverBackground: alpha(foreground, 0.3),
      scrollbarSliderActiveBackground: alpha(foreground, 0.4),
    },
  };
};
