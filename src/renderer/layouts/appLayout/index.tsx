import React from 'react';
import { Box, CssBaseline } from '@mui/material';
import { Sidebar } from '../../components';
import { StatusBar } from '../../components/statusBar';
import { Content, Main, Root } from './styles';

type Props = {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
};

export const AppLayout: React.FC<Props> = ({ sidebarContent, children }) => {
  return (
    <Root>
      <CssBaseline />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar content={sidebarContent} />
        <Content>
          <Main>{children}</Main>
        </Content>
      </Box>
      <StatusBar />
    </Root>
  );
};
