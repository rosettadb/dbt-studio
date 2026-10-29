import { act, renderHook } from '@testing-library/react';
import useTabManager from '../../../../src/renderer/hooks/useTabManager';

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    getFileContent: jest.fn().mockResolvedValue('file content'),
    saveFileContent: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../../src/renderer/lib/monaco/modelStore', () => ({
  disposeModelForPath: jest.fn(),
  renameModel: jest.fn(),
}));

jest.mock('../../../../src/renderer/lib/monaco/viewStateStore', () => ({
  clearViewState: jest.fn(),
}));

describe('useTabManager - new bulk close methods', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
  });

  it('closeTabsToLeft closes tabs to the left of target', async () => {
    const { result } = renderHook(() => useTabManager('test-project'));

    await act(async () => {
      await result.current.openTab('/a.sql');
      await result.current.openTab('/b.sql');
      await result.current.openTab('/c.sql');
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual([
      '/a.sql',
      '/b.sql',
      '/c.sql',
    ]);

    act(() => {
      result.current.closeTabsToLeft('/b.sql');
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual([
      '/b.sql',
      '/c.sql',
    ]);
  });

  it('closeTabsToRight closes tabs to the right of target', async () => {
    const { result } = renderHook(() => useTabManager('test-project'));

    await act(async () => {
      await result.current.openTab('/a.sql');
      await result.current.openTab('/b.sql');
      await result.current.openTab('/c.sql');
    });

    act(() => {
      result.current.closeTabsToRight('/b.sql');
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual([
      '/a.sql',
      '/b.sql',
    ]);
  });

  it('closeOtherTabs closes all tabs except target', async () => {
    const { result } = renderHook(() => useTabManager('test-project'));

    await act(async () => {
      await result.current.openTab('/a.sql');
      await result.current.openTab('/b.sql');
      await result.current.openTab('/c.sql');
    });

    act(() => {
      result.current.closeOtherTabs('/b.sql');
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual(['/b.sql']);
    expect(result.current.activeTabId).toBe('/b.sql');
  });

  it('closeAllSaved closes only unmodified tabs', async () => {
    const { result } = renderHook(() => useTabManager('test-project'));

    await act(async () => {
      await result.current.openTab('/saved1.sql');
      await result.current.openTab('/modified.sql');
      await result.current.openTab('/saved2.sql');
    });

    act(() => {
      result.current.updateTabContent('/modified.sql', 'new content');
    });

    expect(
      result.current.tabs.find((t) => t.path === '/modified.sql')?.isModified,
    ).toBe(true);

    act(() => {
      result.current.closeAllSaved();
    });

    expect(result.current.tabs.map((t) => t.path)).toEqual(['/modified.sql']);
  });

  describe('keeps tabs with unsaved changes open', () => {
    const openFour = async (result: any) => {
      await act(async () => {
        await result.current.openTab('/a.sql');
        await result.current.openTab('/b.sql');
        await result.current.openTab('/c.sql');
        await result.current.openTab('/d.sql');
      });
    };
    const modify = (result: any, path: string) => {
      act(() => {
        result.current.updateTabContent(path, `edited ${path}`);
      });
      expect(
        result.current.tabs.find((t: any) => t.path === path)?.isModified,
      ).toBe(true);
    };
    const idOf = (result: any, path: string) =>
      result.current.tabs.find((t: any) => t.path === path)!.id;

    it('closeOtherTabs keeps changed tabs and reports how many', async () => {
      const { result } = renderHook(() => useTabManager('test-project'));
      await openFour(result);
      modify(result, '/a.sql');

      let kept = -1;
      act(() => {
        kept = result.current.closeOtherTabs(idOf(result, '/c.sql'));
      });

      expect(kept).toBe(1);
      expect(result.current.tabs.map((t) => t.path)).toEqual([
        '/a.sql',
        '/c.sql',
      ]);
      expect(result.current.activeTabId).toBe(idOf(result, '/c.sql'));
    });

    it('closeTabsToLeft keeps changed tabs on the left', async () => {
      const { result } = renderHook(() => useTabManager('test-project'));
      await openFour(result);
      modify(result, '/b.sql');

      let kept = -1;
      act(() => {
        kept = result.current.closeTabsToLeft(idOf(result, '/c.sql'));
      });

      expect(kept).toBe(1);
      expect(result.current.tabs.map((t) => t.path)).toEqual([
        '/b.sql',
        '/c.sql',
        '/d.sql',
      ]);
    });

    it('closeTabsToRight keeps changed tabs on the right', async () => {
      const { result } = renderHook(() => useTabManager('test-project'));
      await openFour(result);
      modify(result, '/d.sql');

      let kept = -1;
      act(() => {
        kept = result.current.closeTabsToRight(idOf(result, '/a.sql'));
      });

      expect(kept).toBe(1);
      expect(result.current.tabs.map((t) => t.path)).toEqual([
        '/a.sql',
        '/d.sql',
      ]);
    });

    it('returns 0 when nothing changed was in range', async () => {
      const { result } = renderHook(() => useTabManager('test-project'));
      await openFour(result);

      let kept = -1;
      act(() => {
        kept = result.current.closeTabsToRight(idOf(result, '/b.sql'));
      });

      expect(kept).toBe(0);
      expect(result.current.tabs.map((t) => t.path)).toEqual([
        '/a.sql',
        '/b.sql',
      ]);
    });
  });
});
