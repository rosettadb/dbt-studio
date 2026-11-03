import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { TabContextMenu } from '../../../../src/renderer/components/tabContextMenu';

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('TabContextMenu', () => {
  const onClose = jest.fn();
  const onCloseTab = jest.fn();
  const onCloseOthers = jest.fn();
  const onCloseToLeft = jest.fn();
  const onCloseToRight = jest.fn();
  const onCloseAll = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders menu items when open', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    expect(screen.getByText('Close')).toBeInTheDocument();
    expect(screen.getByText('Close Others')).toBeInTheDocument();
    expect(screen.getByText('Close to the Left')).toBeInTheDocument();
    expect(screen.getByText('Close to the Right')).toBeInTheDocument();
    expect(screen.getByText('Close All')).toBeInTheDocument();
  });

  it('does not render when anchorPosition is null', () => {
    wrap(
      <TabContextMenu
        anchorPosition={null}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    expect(screen.queryByText('Close')).not.toBeInTheDocument();
  });

  it('triggers onCloseTab and onClose when Close clicked', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    fireEvent.click(screen.getByText('Close'));
    expect(onCloseTab).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onCloseOthers and onClose when Close Others clicked', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    fireEvent.click(screen.getByText('Close Others'));
    expect(onCloseOthers).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onCloseToLeft and onClose when Close to the Left clicked', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    fireEvent.click(screen.getByText('Close to the Left'));
    expect(onCloseToLeft).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onCloseToRight and onClose when Close to the Right clicked', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    fireEvent.click(screen.getByText('Close to the Right'));
    expect(onCloseToRight).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('triggers onCloseAll and onClose when Close All clicked', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
      />,
    );

    fireEvent.click(screen.getByText('Close All'));
    expect(onCloseAll).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables directional and others items according to props', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft={false}
        hasTabsToRight={false}
        hasOtherTabs={false}
      />,
    );

    const closeOthersItem = screen.getByText('Close Others').closest('li');
    const closeToLeftItem = screen.getByText('Close to the Left').closest('li');
    const closeToRightItem = screen
      .getByText('Close to the Right')
      .closest('li');

    expect(closeOthersItem).toHaveClass('Mui-disabled');
    expect(closeToLeftItem).toHaveClass('Mui-disabled');
    expect(closeToRightItem).toHaveClass('Mui-disabled');
  });

  it('renders and handles Close Saved when onCloseSaved is provided', () => {
    const onCloseSaved = jest.fn();
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        onCloseSaved={onCloseSaved}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
        hasSavedTabs
      />,
    );

    const closeSaved = screen.getByText('Close Saved');
    expect(closeSaved).toBeInTheDocument();
    fireEvent.click(closeSaved);
    expect(onCloseSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('disables Close Saved when hasSavedTabs is false', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        onCloseSaved={jest.fn()}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
        hasSavedTabs={false}
      />,
    );

    const closeSavedItem = screen.getByText('Close Saved').closest('li');
    expect(closeSavedItem).toHaveClass('Mui-disabled');
  });

  it('renders extras when provided', () => {
    wrap(
      <TabContextMenu
        anchorPosition={{ top: 100, left: 100 }}
        onClose={onClose}
        onCloseTab={onCloseTab}
        onCloseOthers={onCloseOthers}
        onCloseToLeft={onCloseToLeft}
        onCloseToRight={onCloseToRight}
        onCloseAll={onCloseAll}
        hasTabsToLeft
        hasTabsToRight
        hasOtherTabs
        extras={<div data-testid="custom-extras">Custom Action</div>}
      />,
    );

    expect(screen.getByTestId('custom-extras')).toBeInTheDocument();
    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });
});
