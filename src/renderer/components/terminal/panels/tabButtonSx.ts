import type { Theme } from '@mui/material';

export const tabButtonSx = (theme: Theme, isSelected: boolean) => ({
  minHeight: 22,
  height: 22,
  padding: '0 10px',
  borderRadius: '4px',
  marginRight: '6px',
  backgroundColor: isSelected ? theme.palette.action.selected : 'transparent',
  transition: 'background-color 0.15s, border-color 0.15s',
  border: `1px solid ${isSelected ? theme.palette.divider : 'transparent'}`,
  color: isSelected ? theme.palette.text.primary : theme.palette.text.secondary,
  textTransform: 'none' as const,
  letterSpacing: 0.2,
  '&:hover': {
    backgroundColor: isSelected
      ? theme.palette.action.selected
      : theme.palette.action.hover,
    borderColor: isSelected ? theme.palette.divider : 'transparent',
  },
});
