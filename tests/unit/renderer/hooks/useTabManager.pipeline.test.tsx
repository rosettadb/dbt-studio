import { act, renderHook, waitFor } from '@testing-library/react';
import useTabManager from '../../../../src/renderer/hooks/useTabManager';
import {
  toCanonicalEditorTabPath,
  toPipelineTabPath,
} from '../../../../src/renderer/components/editor/previewConstants';

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    getFileContent: jest.fn(),
  },
}));

jest.mock('../../../../src/renderer/lib/monaco/modelStore', () => ({
  disposeModelForPath: jest.fn(),
  renameModel: jest.fn(),
}));

jest.mock('../../../../src/renderer/lib/monaco/viewStateStore', () => ({
  clearViewState: jest.fn(),
}));

const PROJECT_ID = 'pipeline-tab-project';
const PIPELINE_PATH = '/project/.rosetta/pipeline-generic.yml';
const PIPELINE_TAB_PATH = toPipelineTabPath(PIPELINE_PATH);

describe('useTabManager pipeline tab canonicalization', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('maps both real and virtual pipeline paths to one Pipeline Editor tab', async () => {
    const { result } = renderHook(() => useTabManager(PROJECT_ID));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.openTab(PIPELINE_PATH);
      await result.current.openTab(PIPELINE_TAB_PATH);
      await result.current.openTab(PIPELINE_PATH);
    });

    act(() => {
      result.current.updateTabContentByPath(PIPELINE_PATH, 'name: Restored', {
        markModified: false,
      });
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]).toMatchObject({
      id: PIPELINE_TAB_PATH,
      path: PIPELINE_TAB_PATH,
      content: 'name: Restored',
      isModified: false,
      isReadOnly: true,
    });
    expect(toCanonicalEditorTabPath(PIPELINE_PATH)).toBe(PIPELINE_TAB_PATH);
  });

  it('replaces an unmodified legacy Monaco pipeline tab with the virtual tab', async () => {
    localStorage.setItem(
      `dbt-studio:tabs:${PROJECT_ID}`,
      JSON.stringify({
        tabs: [
          {
            id: PIPELINE_PATH,
            path: PIPELINE_PATH,
            title: 'pipeline-generic.yml',
            content: 'name: Legacy',
            savedContent: 'name: Legacy',
            isModified: false,
            isLoading: false,
            isReadOnly: false,
          },
        ],
        activeTabId: PIPELINE_PATH,
      }),
    );

    const { result } = renderHook(() => useTabManager(PROJECT_ID));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.openTab(PIPELINE_TAB_PATH);
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0].path).toBe(PIPELINE_TAB_PATH);
  });

  it('does not discard an unsaved legacy Monaco pipeline tab', async () => {
    localStorage.setItem(
      `dbt-studio:tabs:${PROJECT_ID}`,
      JSON.stringify({
        tabs: [
          {
            id: PIPELINE_PATH,
            path: PIPELINE_PATH,
            title: 'pipeline-generic.yml',
            content: 'name: Unsaved',
            savedContent: 'name: Saved',
            isModified: true,
            isLoading: false,
            isReadOnly: false,
          },
        ],
        activeTabId: PIPELINE_PATH,
      }),
    );

    const { result } = renderHook(() => useTabManager(PROJECT_ID));
    await waitFor(() => expect(result.current.isHydrated).toBe(true));

    await act(async () => {
      await result.current.openTab(PIPELINE_TAB_PATH);
    });

    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.tabs[0]).toMatchObject({
      path: PIPELINE_PATH,
      content: 'name: Unsaved',
      isModified: true,
    });
  });
});
