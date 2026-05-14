import React from 'react';
import { Box, CssBaseline } from '@mui/material';
import { Sidebar, StatusBar, Menu } from '../../components';
import { Content, Main, Root, ContentColumn } from './styles';
import { useAppLayoutContext } from './context';

export { AppShell } from './AppShell';

type Props = {
  children: React.ReactNode;
  sidebarContent?: React.ReactNode;
  panelHeaderLeft?: React.ReactNode;
  panelTitle?: string;
  topMenuActions?: React.ReactNode;
};

export const AppLayout: React.FC<Props> = ({
  sidebarContent,
  panelHeaderLeft,
  panelTitle,
  topMenuActions,
  children,
}) => {
  const ctx = useAppLayoutContext();

  React.useEffect(() => {
    if (!ctx) return;
    ctx.setSlots({
      sidebarContent,
      panelHeaderLeft,
      panelTitle,
      topMenuActions,
    });
  }, [ctx, sidebarContent, panelHeaderLeft, panelTitle, topMenuActions]);

  if (ctx) {
    return children;
  }

  return (
    <Root>
      <CssBaseline />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <Sidebar
          content={sidebarContent}
          panelHeaderLeft={panelHeaderLeft}
          panelTitle={panelTitle}
        />
        <ContentColumn>
          <Menu actions={topMenuActions} />
          <Content>
            <Main>{children}</Main>
          </Content>
        </ContentColumn>
      </Box>
      <StatusBar />
    </Root>
  );
};
