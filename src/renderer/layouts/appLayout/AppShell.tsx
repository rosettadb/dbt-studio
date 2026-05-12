import React from 'react';
import { Box, CssBaseline } from '@mui/material';
import { Outlet } from 'react-router-dom';
import { Sidebar, StatusBar, Menu } from '../../components';
import { Content, Main, Root, ContentColumn } from './styles';
import { AppLayoutContext, AppLayoutSlots } from './context';

export const AppShell: React.FC = () => {
  const [slots, setSlots] = React.useState<AppLayoutSlots>({});

  const ctxValue = React.useMemo(() => ({ setSlots }), []);

  return (
    <AppLayoutContext.Provider value={ctxValue}>
      <Root>
        <CssBaseline />
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <Sidebar
            content={slots.sidebarContent}
            panelHeaderLeft={slots.panelHeaderLeft}
            panelTitle={slots.panelTitle}
          />
          <ContentColumn>
            <Menu actions={slots.topMenuActions} />
            <Content>
              <Main>
                <Outlet />
              </Main>
            </Content>
          </ContentColumn>
        </Box>
        <StatusBar />
      </Root>
    </AppLayoutContext.Provider>
  );
};
