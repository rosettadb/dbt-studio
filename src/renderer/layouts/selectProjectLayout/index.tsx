import React from 'react';
import { Outlet } from 'react-router-dom';
import { CssBaseline } from '@mui/material';
import { Content, Main, Root } from './styles';

export const SelectProjectLayout: React.FC = () => {
  return (
    <Root>
      <CssBaseline />
      <Content>
        <Main>
          <Outlet />
        </Main>
      </Content>
    </Root>
  );
};
