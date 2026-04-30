import { styled, type Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';

const getBaseBackgroundColor = (theme: Theme, active: boolean) => {
  if (!active) {
    return 'transparent';
  }

  if (theme.palette.mode === 'dark') {
    return 'rgba(255,255,255,0.08)';
  }

  return 'rgba(0,0,0,0.08)';
};

const getHoverBackgroundColor = (theme: Theme, active: boolean) => {
  if (!active) {
    return theme.palette.action.hover;
  }

  if (theme.palette.mode === 'dark') {
    return 'rgba(255,255,255,0.12)';
  }

  return 'rgba(0,0,0,0.12)';
};

export const TabBar = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  backgroundColor: theme.palette.background.paper,
  padding: theme.spacing(0, 1),
  flex: 1,
  minWidth: 0,
}));

export const TabsContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  flex: 1,
  minWidth: 0,
  overflow: 'auto',
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  scrollbarColor:
    theme.palette.mode === 'dark'
      ? 'rgba(255, 255, 255, 0.28) transparent'
      : 'rgba(0, 0, 0, 0.28) transparent',
  '&&::-webkit-scrollbar': {
    WebkitAppearance: 'none !important',
    height: '2px !important',
    width: '2px !important',
  },
  '&&::-webkit-scrollbar-track': {
    background: 'transparent !important',
  },
  '&&::-webkit-scrollbar-thumb': {
    WebkitAppearance: 'none !important',
    background:
      theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.28) !important'
        : 'rgba(0, 0, 0, 0.28) !important',
    borderRadius: '4px !important',
    '&:hover': {
      background:
        theme.palette.mode === 'dark'
          ? 'rgba(255, 255, 255, 0.4) !important'
          : 'rgba(0, 0, 0, 0.4) !important',
    },
  },
}));

export const DropIndicator = styled('div')(({ theme }) => ({
  width: 3,
  height: 22,
  borderRadius: 999,
  backgroundColor: theme.palette.primary.main,
  boxShadow: `0 0 0 1px ${theme.palette.background.paper}`,
  transition: 'opacity 120ms ease',
}));

export const TabButton = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active' && prop !== 'isLast',
})<{ active: boolean; isLast?: boolean }>(({ theme, active, isLast }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  padding: theme.spacing(0.5, 1.25),
  minHeight: 32,
  borderRadius: 0,
  cursor: 'pointer',
  position: 'relative',
  backgroundColor: getBaseBackgroundColor(theme, active),
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  borderTop: active
    ? `2px solid ${theme.palette.primary.main}`
    : '2px solid transparent',
  borderBottom: 'none',
  borderLeft: 'none',
  borderRight: isLast ? 'none' : `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
  transition: 'background-color 120ms ease, color 120ms ease',
  '&:hover': {
    backgroundColor: getHoverBackgroundColor(theme, active),
    color: theme.palette.text.primary,
  },
}));

export const TabTitle = styled('span')(({ theme }) => ({
  fontSize: 13,
  lineHeight: 1.2,
  maxWidth: 160,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: theme.palette.text.primary,
}));

export const ModifiedDot = styled('span')<{ hidden?: boolean }>(
  ({ theme, hidden }) => ({
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: hidden ? 'transparent' : theme.palette.warning.main,
  }),
);

export const LoadingDot = styled('span')(({ theme }) => ({
  width: 8,
  height: 8,
  borderRadius: 999,
  backgroundColor: theme.palette.info.main,
  animation: 'pulse 1.2s ease-in-out infinite',
  '@keyframes pulse': {
    '0%, 100%': {
      opacity: 0.4,
    },
    '50%': {
      opacity: 1,
    },
  },
}));

export const EmptyTabsPlaceholder = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  color: theme.palette.text.secondary,
  fontSize: 13,
  padding: theme.spacing(0, 1),
}));
