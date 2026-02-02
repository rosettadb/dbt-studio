import { Box, InputBase, styled } from '@mui/material';

export const TerminalContainer = styled('form')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.grey[900]
      : theme.palette.grey[50],
  color: theme.palette.text.primary,
  fontFamily: 'monospace',
  padding: theme.spacing(1),
  height: '100%',
  width: '100%',
  overflow: 'hidden',
}));

export const OutputBox = styled(Box)(({ theme }) => ({
  flex: 1,
  overflowY: 'auto',
  color: theme.palette.text.primary,
  backgroundColor:
    theme.palette.mode === 'dark'
      ? theme.palette.grey[900]
      : theme.palette.grey[50],
  paddingRight: theme.spacing(1),
  marginBottom: 0,
  whiteSpace: 'pre-wrap',
  fontFamily: 'monospace',
}));

export const StyledInput = styled(InputBase)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontFamily: 'monospace',
  fontSize: 12,
  backgroundColor: 'transparent',
  flex: 1,
  '& input': {
    padding: 0,
  },
  height: 16,
}));

export const InputLine = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: `${theme.spacing(0.5)} 0`,
}));

export const Root = styled(Box)(() => ({
  height: '100vh',
  display: 'flex',
  flexDirection: 'column',
}));

export const Sash = styled(Box)(({ theme }) => ({
  height: '4px',
  backgroundColor: theme.palette.divider,
  cursor: 'row-resize',
  width: '100%',
}));

export const EditorWrapper = styled(Box)(() => ({
  height: '100%',
  overflow: 'auto',
}));

export const TerminalWrapper = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  backgroundColor: theme.palette.background.default,
}));

export const TerminalHeader = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  display: 'flex',
  alignItems: 'center',
  padding: '2px 2px 0 2px',
  height: '40px',
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const Taskbar = styled(Box)(({ theme }) => ({
  height: 40,
  backgroundColor: theme.palette.background.paper,
  display: 'flex',
  alignItems: 'center',
  paddingLeft: theme.spacing(1),
  paddingRight: theme.spacing(1),
  borderTop: `1px solid ${theme.palette.divider}`,
  fontFamily: 'monospace',
}));

export const TaskbarItem = styled(Box)(({ theme }) => ({
  color: theme.palette.primary.main,
  height: 30,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  padding: `${theme.spacing(0.5)} ${theme.spacing(1.5)}`,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));
