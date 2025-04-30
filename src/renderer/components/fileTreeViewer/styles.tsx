import { styled, Typography } from '@mui/material';
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
  padding: 1,
  display: 'flex',
  alignItems: 'center',
}));

export const StyledLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontSize: 15,
  marginLeft: 5,
  width: 140,
}));

export const StyledTreeView = styled(SimpleTreeView)(() => ({
  height: 'calc(100% - 90px)',
  overflowY: 'auto',
  paddingBottom: 10,
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
}));
