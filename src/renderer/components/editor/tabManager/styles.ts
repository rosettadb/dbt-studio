import { styled, type Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import ButtonBase from '@mui/material/ButtonBase';

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
  height: 40,
  backgroundColor: theme.palette.background.paper,
  borderBottom: `1px solid ${theme.palette.divider}`,
  padding: theme.spacing(0, 1),
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  '&::-webkit-scrollbar': {
    height: 6,
  },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: 999,
    backgroundColor:
      theme.palette.mode === 'dark'
        ? 'rgba(255,255,255,0.15)'
        : 'rgba(0,0,0,0.15)',
  },
}));

export const TabButton = styled(ButtonBase)<{ active: boolean }>(
  ({ theme, active }) => ({
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.5, 1.25),
    borderRadius: theme.shape.borderRadius,
    cursor: 'pointer',
    backgroundColor: getBaseBackgroundColor(theme, active),
    color: theme.palette.text.primary,
    border: active
      ? `1px solid ${theme.palette.primary.main}`
      : '1px solid transparent',
    transition: 'background-color 120ms ease, border-color 120ms ease',
    '&:hover': {
      backgroundColor: getHoverBackgroundColor(theme, active),
    },
  }),
);

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
