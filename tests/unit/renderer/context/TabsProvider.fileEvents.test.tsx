import React from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  TabsProvider,
  useTabs,
} from '../../../../src/renderer/context/TabsProvider';
import {
  notifySavedContentChanged,
  onDidCloseFile,
  onDidOpenFile,
} from '../../../../src/extensionHost/renderer/documents.renderer';

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetSelectedProject: () => ({
    data: { id: 'test-project', path: '/proj' },
  }),
  useGetConnectionById: () => ({ data: undefined }),
}));

jest.mock('../../../../src/renderer/hooks/useRefreshProjectFiles', () => ({
  useRefreshProjectFiles: () => jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    getFileContent: jest.fn().mockResolvedValue('on disk'),
  },
}));

jest.mock('../../../../src/renderer/services/agentEvents.service', () => ({
  subscribeToToolResult: () => () => {},
}));

jest.mock('../../../../src/renderer/lib/monaco/modelStore', () => ({
  disposeModelForPath: jest.fn(),
  renameModel: jest.fn(),
}));

jest.mock('../../../../src/renderer/lib/monaco/viewStateStore', () => ({
  clearViewState: jest.fn(),
}));

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TabsProvider>{children}</TabsProvider>
);

const FILE = '/proj/models/a.sql';

describe('TabsProvider - file events for extensions', () => {
  beforeEach(() => localStorage.clear());

  it('reports a file when it is opened and when its tab is closed', async () => {
    const opened = jest.fn();
    const closed = jest.fn();
    const subscriptions = [onDidOpenFile(opened), onDidCloseFile(closed)];
    const { result } = renderHook(() => useTabs(), { wrapper });

    await act(async () => {
      await result.current.openFile(FILE);
    });

    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened).toHaveBeenCalledWith({ path: FILE });
    expect(closed).not.toHaveBeenCalled();

    act(() => {
      result.current.closeTab(result.current.tabs[0].id);
    });

    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed).toHaveBeenCalledWith({ path: FILE });
    subscriptions.forEach((subscription) => subscription.dispose());
  });

  it('does not report a preview tab as a file', async () => {
    const opened = jest.fn();
    const subscription = onDidOpenFile(opened);
    const { result } = renderHook(() => useTabs(), { wrapper });

    await act(async () => {
      await result.current.togglePreview('/proj/README.md', '# Title');
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(opened).not.toHaveBeenCalled();
    subscription.dispose();
  });

  it('shows in the open tab what a pre-save hook wrote to disk', async () => {
    const { result } = renderHook(() => useTabs(), { wrapper });
    await act(async () => {
      await result.current.openFile(FILE);
    });
    act(() => {
      result.current.updateTabContent(result.current.tabs[0].id, 'select  1');
    });

    act(() => notifySavedContentChanged(FILE, 'select 1'));

    expect(result.current.tabs[0]).toMatchObject({
      content: 'select 1',
      savedContent: 'select 1',
      isModified: false,
    });
  });
});
