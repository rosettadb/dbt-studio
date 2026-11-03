import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { SqlTabManager } from '../../../../src/renderer/components/sqlTabs';
import { SqlTabState } from '../../../../src/types/editor';

const tab: SqlTabState = {
  id: 't1',
  connectionId: 'c1',
  connectionName: 'my_postgres',
  connectionType: 'postgres',
  query: 'select 1',
  isModified: false,
  isLoading: false,
};

describe('SqlTabManager context menu copy', () => {
  const originalExecCommand = document.execCommand;
  let setData: jest.Mock;

  beforeEach(() => {
    setData = jest.fn();
    document.execCommand = jest.fn(() => {
      const event = new Event('copy', { cancelable: true }) as Event & {
        clipboardData: { setData: jest.Mock };
      };
      event.clipboardData = { setData };
      document.dispatchEvent(event);
      return true;
    });
  });

  afterEach(() => {
    document.execCommand = originalExecCommand;
  });

  it.each([
    ['Copy Query', 'select 1'],
    ['Copy Connection Name', 'my_postgres'],
  ])('%s copies the tab value', (label, expected) => {
    render(
      <ThemeProvider theme={createTheme()}>
        <SqlTabManager
          tabs={[tab]}
          activeTabId="t1"
          onSelect={jest.fn()}
          onClose={jest.fn()}
          onReorder={jest.fn()}
        />
      </ThemeProvider>,
    );

    fireEvent.contextMenu(screen.getByText('my_postgres'));
    fireEvent.click(screen.getByText(label));

    expect(setData).toHaveBeenCalledWith('text/plain', expected);
  });
});
