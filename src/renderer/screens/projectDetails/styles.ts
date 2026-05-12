import { styled } from '@mui/material';

export const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 10,
}));

export const Header = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  color: theme.palette.text.primary,
  background: theme.palette.background.paper,
  paddingRight: theme.spacing(1),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const Content = styled('div')(() => ({
  display: 'flex',
  paddingBottom: 2,
  height: '100%',
  gap: 10,
}));

export const FileTreeContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  background: theme.palette.background.paper,
  borderRadius: 8,
  padding: '5px',
  height: '100%',
  width: '100%',
}));

export const EditorContainer = styled('div')(({ theme }) => ({
  background: theme.palette.background.paper,
  height: '100%',
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
}));

export const NoFileSelected = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
  color: theme.palette.text.secondary,
}));
