import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { analyticsWorkspaceTab } from '../../../../src/extensions/analytics/renderer/workspaceTab';
import type { WorkspaceTabProps } from '../../../../src/extensionApi/renderer';

// The Analytics components have their own tests; here only what the tab
// passes to them matters.
jest.mock(
  '../../../../src/extensions/analytics/renderer/AnalyticsPagesTreeView',
  () => ({
    AnalyticsPagesTreeView: ({
      connectionId,
      connectionName,
      activePageId,
      onOpenPage,
      onDeletePage,
    }: any) => (
      <div>
        <span>
          tree {connectionId} {connectionName} active:
          {String(activePageId)}
        </span>
        <button type="button" onClick={() => onOpenPage('p2')}>
          open p2
        </button>
        <button type="button" onClick={() => onDeletePage('p1')}>
          delete p1
        </button>
        <button type="button" onClick={() => onDeletePage('other')}>
          delete other
        </button>
      </div>
    ),
  }),
);
jest.mock(
  '../../../../src/extensions/analytics/renderer/AnalyticsEditor',
  () => ({
    AnalyticsEditor: ({ connectionId, pageId }: any) => (
      <span>
        editor {connectionId} {pageId}
      </span>
    ),
  }),
);
jest.mock(
  '../../../../src/extensions/analytics/renderer/bi/gallery/AnalyticsPagesGallery',
  () => ({
    AnalyticsPagesGallery: ({ connectionId, onOpenPage }: any) => (
      <button type="button" onClick={() => onOpenPage('p3')}>
        gallery {connectionId}
      </button>
    ),
  }),
);

const props = (
  state: string | null,
  setState = jest.fn(),
): WorkspaceTabProps<string> => ({
  connectionId: 'c1',
  connectionName: 'Warehouse',
  state,
  setState,
});

describe('Analytics as a tab of the SQL Editor screen', () => {
  const { Sidebar, Main } = analyticsWorkspaceTab;

  it('lists the pages of the connection and opens the one that is picked', () => {
    const setState = jest.fn();
    // eslint-disable-next-line react/jsx-props-no-spreading
    render(<Sidebar {...props('p1', setState)} />);

    expect(screen.getByText(/tree c1 Warehouse active:\s*p1/)).toBeTruthy();
    fireEvent.click(screen.getByText('open p2'));

    expect(setState).toHaveBeenCalledWith('p2');
  });

  it('goes back to the gallery when the open page is deleted, and only then', () => {
    const setState = jest.fn();
    // eslint-disable-next-line react/jsx-props-no-spreading
    render(<Sidebar {...props('p1', setState)} />);

    fireEvent.click(screen.getByText('delete other'));
    expect(setState).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('delete p1'));
    expect(setState).toHaveBeenCalledWith(null);
  });

  it('shows the gallery until a page is open, then that page', () => {
    const setState = jest.fn();
    // eslint-disable-next-line react/jsx-props-no-spreading
    const gallery = render(<Main {...props(null, setState)} />);
    fireEvent.click(screen.getByText('gallery c1'));
    expect(setState).toHaveBeenCalledWith('p3');
    gallery.unmount();

    // eslint-disable-next-line react/jsx-props-no-spreading
    render(<Main {...props('p3')} />);
    expect(screen.getByText('editor c1 p3')).toBeTruthy();
  });

  it('asks for the Analytics assistant, on the open page', () => {
    expect(analyticsWorkspaceTab.assistant?.('p1')).toEqual({
      screenKey: 'analytics',
      pageId: 'p1',
    });
    expect(analyticsWorkspaceTab.assistant?.(null)).toEqual({
      screenKey: 'analytics',
      pageId: undefined,
    });
  });
});
