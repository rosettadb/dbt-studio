import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TabContextMenu } from '../../../../src/renderer/components/tabContextMenu';

const renderMenu = (onClose: jest.Mock) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <TabContextMenu
        anchorPosition={{ top: 10, left: 10 }}
        onClose={onClose}
        onCloseTab={jest.fn()}
        onCloseOthers={jest.fn()}
        onCloseToLeft={jest.fn()}
        onCloseToRight={jest.fn()}
        onCloseAll={jest.fn()}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />
    </ThemeProvider>,
  );

describe('TabContextMenu right-click on backdrop', () => {
  const original = document.elementsFromPoint;

  afterEach(() => {
    document.elementsFromPoint = original;
  });

  it('closes and forwards the right-click to the tab underneath', () => {
    const otherTab = document.createElement('div');
    document.body.appendChild(otherTab);
    const forwarded = jest.fn();
    otherTab.addEventListener('contextmenu', forwarded);
    document.elementsFromPoint = jest.fn(() => [otherTab]);
    const onClose = jest.fn();

    renderMenu(onClose);
    const backdrop = document.querySelector('.MuiBackdrop-root') as HTMLElement;
    fireEvent.contextMenu(backdrop, { clientX: 50, clientY: 5 });

    expect(onClose).toHaveBeenCalled();
    expect(forwarded).toHaveBeenCalledTimes(1);
    expect(forwarded.mock.calls[0][0].clientX).toBe(50);
    document.body.removeChild(otherTab);
  });

  it('ignores right-clicks inside the menu', () => {
    document.elementsFromPoint = jest.fn(() => []);
    const onClose = jest.fn();

    renderMenu(onClose);
    fireEvent.contextMenu(screen.getByText('Close Others'));

    expect(onClose).not.toHaveBeenCalled();
    expect(document.elementsFromPoint).not.toHaveBeenCalled();
  });
});
