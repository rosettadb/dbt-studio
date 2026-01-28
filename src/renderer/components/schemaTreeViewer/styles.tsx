import { styled, Typography } from '@mui/material';
import { SimpleTreeView, treeItemClasses } from '@mui/x-tree-view';

export const Container = styled('div')(() => ({
  height: '100%',
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
  padding: 0,
  display: 'flex',
  alignItems: 'center',
  minHeight: '22px',
}));

export const StyledLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.primary,
  fontSize: '15px',
  marginLeft: '4px',
  width: 220,
}));

export const StyledColumnLabel = styled(Typography)(({ theme }) => ({
  color: theme.palette.text.secondary,
  fontSize: '14px',
  marginLeft: '4px',
  width: 200,
}));

export const StyledTreeView = styled(SimpleTreeView)(() => ({
  height: '100%',
  overflowY: 'auto',
  [`& .${treeItemClasses.content}`]: {
    padding: '0px 2px',
    minHeight: '22px',
    '&.Mui-selected': {
      backgroundColor: 'rgba(0, 0, 0, 0.08)',
    },
  },
  [`& .${treeItemClasses.iconContainer}`]: {
    width: '12px',
    marginRight: '-4px',
    '& svg': {
      fontSize: '16px',
    },
  },
  [`& .${treeItemClasses.groupTransition}`]: {
    marginLeft: '12px',
    paddingLeft: '0px',
    // Tighter indentation for columns (nested levels)
    [`& .${treeItemClasses.groupTransition}`]: {
      marginLeft: '8px',
      [`& .${treeItemClasses.groupTransition}`]: {
        marginLeft: '6px',
      },
    },
  },
}));

export const DatabaseIcon = styled('img')(() => ({
  width: 14,
  height: 14,
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
