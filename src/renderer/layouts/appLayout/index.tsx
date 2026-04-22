import React from 'react';
import { CssBaseline } from '@mui/material';
import { Sidebar, StatusBar, Menu } from '../../components';
import { Content, Main, Root, ContentColumn } from './styles';

type Props = {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
  panelHeaderLeft?: React.ReactNode;
  panelTitle?: string;
};

export const AppLayout: React.FC<Props> = ({
  sidebarContent,
  panelHeaderLeft,
  panelTitle,
  children,
}) => {
  return (
    <Root>
      <CssBaseline />
      <Sidebar
        content={sidebarContent}
        panelHeaderLeft={panelHeaderLeft}
        panelTitle={panelTitle}
      />
      <ContentColumn>
        <Menu />
        <Content>
          <Main>{children}</Main>
        </Content>
      </ContentColumn>
      <StatusBar />
    </Root>
  );
};
