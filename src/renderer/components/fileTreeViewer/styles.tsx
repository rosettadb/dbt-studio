import { styled, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import { SimpleTreeView } from '@mui/x-tree-view';

export const Container = styled('div')(() => ({
  height: '100%',
  borderRadius: 7,
}));

export const Header = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid #ddd',
  fontSize: 14,
  color: '#8e8d8d',
  marginBottom: 10,
  paddingBottom: 2,
}));

export const StyledTreeItem = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  height: 18,
}));

export const StyledLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontSize: 15,
  paddingLeft: 5,
  width: 140,
}));

export const StyledTreeView = styled(SimpleTreeView)(() => ({
  height: 'calc(100% - 60px)',
  overflowY: 'auto',
  paddingBottom: 10,
  // Hide the icon area while renaming to avoid leading glyph before the input
  '& .renaming .MuiTreeItem-iconContainer': {
    display: 'none',
  },
}));

export const LabelContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  width: '100%',
  '&:hover .actions-container': {
    opacity: 1,
    transition: 'opacity 0.2s ease-in-out',
  },
}));

export const ActionsContainer = styled('div')(() => ({
  display: 'flex',
  gap: 4,
  opacity: 0,
  transition: 'opacity 0.2s ease-in-out',
  position: 'absolute',
  right: 0,
}));

export const RenameInput = styled('input')(({ theme }) => ({
  // Inherit typography and colors from the tree label
  font: 'inherit',
  fontSize: 14,
  lineHeight: 1.0,
  color: theme.palette.text.primary,
  backgroundColor: 'transparent',
  // Sizing and spacing similar to small TextField input
  padding: '2px 6px',
  borderRadius: theme.shape.borderRadius,
  border: 'none',
  width: '100%',
  maxWidth: 240,
  boxSizing: 'border-box',
  // Remove default outline and use theme-focused ring
  outline: 'none',
  caretColor: theme.palette.text.primary,
  transition: 'none',
  '::placeholder': {
    color: alpha(theme.palette.text.primary, 0.5),
  },
  '&:hover': {},
  '&:focus': {
    outline: 'none',
    boxShadow: 'none',
  },
}));
