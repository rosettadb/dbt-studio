import React from 'react';
import { CssBaseline } from '@mui/material';
import { Sidebar } from '../../components';
import { Content, Main, Root } from './styles';

type Props = {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
};

export const AppLayout: React.FC<Props> = ({ sidebarContent, children }) => {
  return (
    <Root>
      <CssBaseline />
      <Sidebar content={sidebarContent} />
      <Content>
        <Main>{children}</Main>
      </Content>
    </Root>
  );
};
