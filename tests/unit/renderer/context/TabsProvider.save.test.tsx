import React from 'react';
import { act, renderHook } from '@testing-library/react';
import {
  TabsProvider,
  useTabs,
} from '../../../../src/renderer/context/TabsProvider';
import { projectsServices } from '../../../../src/renderer/services';

const mockRefreshProjectFiles = jest.fn().mockResolvedValue(undefined);

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetSelectedProject: () => ({
    data: { id: 'test-project', path: '/proj' },
  }),
  useGetConnectionById: () => ({ data: undefined }),
}));

jest.mock('../../../../src/renderer/hooks/useRefreshProjectFiles', () => ({
  useRefreshProjectFiles: () => mockRefreshProjectFiles,
}));

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    getFileContent: jest.fn().mockResolvedValue('on disk'),
    saveFileContent: jest.fn().mockResolvedValue(undefined),
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

const saveFileContent = projectsServices.saveFileContent as jest.Mock;

const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <TabsProvider>{children}</TabsProvider>
);

const FILE = '/proj/models/a.sql';

// Holds the next saveFileContent call open until `finish` is called.
const holdNextWrite = () => {
  let finish!: () => void;
  saveFileContent.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  return () => finish();
};

const renderWithEditedTab = async () => {
  const hook = renderHook(() => useTabs(), { wrapper });
  await act(async () => {
    await hook.result.current.openFile(FILE);
  });
  act(() => {
    hook.result.current.updateTabContent(FILE, 'first edit');
  });
  return hook;
};

const tabOf = (result: { current: ReturnType<typeof useTabs> }) =>
  result.current.tabs.find((t) => t.path === FILE)!;

describe('TabsProvider - saving while the tab is edited', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('saveTab marks the tab saved when nothing changed during the write', async () => {
    const { result } = await renderWithEditedTab();

    await act(async () => {
      await result.current.saveTab(FILE);
    });

    expect(saveFileContent).toHaveBeenCalledWith({
      path: FILE,
      content: 'first edit',
    });
    expect(tabOf(result).isModified).toBe(false);
    expect(tabOf(result).savedContent).toBe('first edit');
  });

  it('saveTab keeps the tab modified when it was edited during the write', async () => {
    const { result } = await renderWithEditedTab();
    const finishWrite = holdNextWrite();

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.saveTab(FILE);
    });
    act(() => {
      result.current.updateTabContent(FILE, 'second edit');
    });
    await act(async () => {
      finishWrite();
      await saving;
    });

    expect(saveFileContent).toHaveBeenCalledWith({
      path: FILE,
      content: 'first edit',
    });
    expect(tabOf(result).content).toBe('second edit');
    expect(tabOf(result).savedContent).toBe('first edit');
    expect(tabOf(result).isModified).toBe(true);
  });

  it('saveAll keeps the tab modified when it was edited during the write', async () => {
    const { result } = await renderWithEditedTab();
    const finishWrite = holdNextWrite();

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.saveAll();
    });
    act(() => {
      result.current.updateTabContent(FILE, 'second edit');
    });
    await act(async () => {
      finishWrite();
      await saving;
    });

    expect(tabOf(result).savedContent).toBe('first edit');
    expect(tabOf(result).isModified).toBe(true);
  });

  it('a tab edited during the write survives closeAll', async () => {
    const { result } = await renderWithEditedTab();
    const finishWrite = holdNextWrite();

    let saving!: Promise<void>;
    act(() => {
      saving = result.current.saveTab(FILE);
    });
    act(() => {
      result.current.updateTabContent(FILE, 'second edit');
    });
    await act(async () => {
      finishWrite();
      await saving;
    });
    act(() => {
      result.current.closeAll();
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual([FILE]);
  });
});
