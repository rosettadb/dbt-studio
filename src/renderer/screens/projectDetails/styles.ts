import { styled } from '@mui/material';

export const Container = styled('div')(() => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  gap: 10,
}));

export const Header = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: theme.palette.text.primary,
  background: theme.palette.background.paper,
  padding: '0 16px',
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
  width: 310,
}));

export const EditorContainer = styled('div')(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  background: theme.palette.background.paper,
  height: '100%',
  flex: 1,
}));

export const ButtonsContainer = styled('div')(() => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px',
  marginLeft: 'auto',
}));

export const NoFileSelected = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  width: '100%',
  color: theme.palette.text.secondary,
}));

export const SelectedFile = styled('div')(({ theme }) => ({
  display: 'flex',
  color: theme.palette.primary.main,
  fontSize: 12,
}));
