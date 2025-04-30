import { Box, InputBase, styled } from '@mui/material';

export const TerminalContainer = styled('form')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  backgroundColor: theme.palette.background.default,
  color: '#0f0',
  fontFamily: 'monospace',
  padding: theme.spacing(2),
  height: '100%',
  width: '100%',
  overflow: 'hidden',
}));

export const OutputBox = styled(Box)(({ theme }) => ({
  flex: 1,
  overflowY: 'auto',
  paddingRight: theme.spacing(1),
  marginBottom: theme.spacing(1),
  whiteSpace: 'pre-wrap',
  fontFamily: 'monospace',
}));

export const StyledInput = styled(InputBase)(() => ({
  color: '#0f0',
  fontFamily: 'monospace',
  fontSize: 14,
  backgroundColor: 'transparent',
  flex: 1,
  '& input': {
    padding: 0,
  },
  height: 16,
}));

export const InputLine = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
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
  backgroundColor: theme.palette.background.default,
  color: theme.palette.success.main,
  display: 'flex',
  justifyContent: 'flex-end',
  alignItems: 'center',
  padding: '2px 8px',
  height: '40px',
}));

export const Taskbar = styled(Box)(({ theme }) => ({
  height: 40,
  backgroundColor: theme.palette.grey[900],
  display: 'flex',
  alignItems: 'center',
  paddingLeft: theme.spacing(1),
  paddingRight: theme.spacing(1),
  borderTop: `1px solid ${theme.palette.grey[800]}`,
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
    backgroundColor: theme.palette.grey[800],
  },
}));
