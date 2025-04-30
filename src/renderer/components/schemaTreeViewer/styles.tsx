import { styled, Typography } from '@mui/material';
import { SimpleTreeView } from '@mui/x-tree-view';

export const Container = styled('div')(() => ({
  height: 'calc(100% - 30px)',
  borderRadius: 7,
}));

export const Header = styled('div')(() => ({
  borderBottom: '1px solid #ddd',
  fontSize: 14,
  color: '#8e8d8d',
  marginBottom: 10,
  paddingBottom: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
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
  width: 200,
}));

export const StyledTreeView = styled(SimpleTreeView)(() => ({
  height: 'calc(100% - 30px)',
  overflowY: 'auto',
}));

export const DatabaseIcon = styled('img')(() => ({
  width: 18,
  height: 18,
  marginRight: 2,
}));

export const NoDataMessage = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
  color: theme.palette.text.secondary,
}));
