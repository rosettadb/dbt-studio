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

export const SqlTabBar = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  backgroundColor: theme.palette.background.paper,
  padding: theme.spacing(0, 1),
  borderBottom: `1px solid ${theme.palette.divider}`,
  flex: '0 0 auto',
  minWidth: 0,
  height: 44,
}));

export const TabsContainer = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 0,
  flex: 1,
  minWidth: 0,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'none',
  msOverflowStyle: 'none' as const,
  '&::-webkit-scrollbar': {
    display: 'none',
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

export const SqlTabButton = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>(({ theme, active }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),
  padding: theme.spacing(0, 1.25),
  height: 44,
  borderRadius: 0,
  cursor: 'pointer',
  backgroundColor: getBaseBackgroundColor(theme, active),
  color: active ? theme.palette.text.primary : theme.palette.text.secondary,
  borderTop: active
    ? `2px solid ${theme.palette.primary.main}`
    : `1px solid ${theme.palette.divider}`,
  borderBottom: active
    ? '1px solid transparent'
    : `1px solid ${theme.palette.divider}`,
  borderLeft: `1px solid ${theme.palette.divider}`,
  borderRight: `1px solid ${theme.palette.divider}`,
  boxShadow: 'none',
  transition:
    'background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease',
  '&:hover': {
    backgroundColor: getHoverBackgroundColor(theme, active),
    color: theme.palette.text.primary,
  },
  '&:not(:first-of-type)': {
    marginLeft: -1,
  },
  '&:first-of-type': {
    borderLeft: `1px solid ${theme.palette.divider}`,
    marginLeft: 0,
  },
  '&:last-of-type': {
    borderRight: `1px solid ${theme.palette.divider}`,
  },
}));

export const TabTitle = styled('span')(({ theme }) => ({
  fontSize: 13,
  lineHeight: 1.2,
  maxWidth: 140,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  color: theme.palette.text.primary,
}));

export const TabIcon = styled('img')(() => ({
  width: 16,
  height: 16,
  objectFit: 'contain',
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
  height: 44,
  flex: 1,
  color: theme.palette.text.secondary,
  fontSize: 13,
  padding: theme.spacing(0, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.paper,
}));
