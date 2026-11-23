import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NodeApi } from 'react-arborist';
import { TreeNode } from '../../../../src/renderer/components/fileTreeViewer/TreeNode';
import { FileNode } from '../../../../src/types/backend';
import type { FileTreeRow } from '../../../../src/extensionApi/renderer';
import {
  fileTreeHoverPreviews,
  fileTreeRowActions,
  projectMenuItems,
} from '../../../../src/extensionHost/renderer/contributions.renderer';
import {
  pipelineCloudRunRowAction,
  pipelineLocalRunRowAction,
} from '../../../../src/renderer/components/pipelineView/PipelineTreeContributions';
import { pipelineRunStore } from '../../../../src/renderer/components/pipelineView/pipelineRunStore';
import {
  pipelineRunLocallyItem,
  pipelineRunOnCloudItem,
} from '../../../../src/renderer/components/pipelineView/pipelineMenuItems';
import { useGetSettings } from '../../../../src/renderer/controllers';
import { isFileUnpushed } from '../../../../src/renderer/services/git.service';

jest.mock('file-icons-js', () => ({ getClassWithColor: () => '' }));
jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../src/renderer/services/git.service', () => ({
  isFileUnpushed: jest.fn(),
}));
jest.mock('../../../../src/renderer/controllers', () => ({
  useGetSettings: jest.fn(),
}));
jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/PipelineThumbnailPreview',
  () => ({ PipelineThumbnailPreview: () => null }),
);

const ActOnRow: React.FC<FileTreeRow> = ({ name }) => (
  <button type="button">Act on {name}</button>
);

const PROJECT_PATH = '/projects/shop';
const PIPELINE = `${PROJECT_PATH}/rosetta/pipelines/nightly/load.yml`;

const fileNode = (filePath: string) =>
  ({
    data: {
      id: filePath,
      name: filePath.split('/').pop(),
      path: filePath,
      type: 'file',
    } as FileNode,
    level: 3,
    isEditing: false,
    isSelected: false,
    isOpen: false,
    toggle: jest.fn(),
  }) as unknown as NodeApi<FileNode>;

const renderRow = (filePath: string, gitStatus?: string) =>
  render(
    <TreeNode
      node={fileNode(filePath)}
      style={{}}
      dragHandle={undefined}
      tree={{} as never}
      fileStatuses={gitStatus ? ({ [filePath]: gitStatus } as never) : {}}
      onContextMenu={jest.fn()}
      onCreateFile={jest.fn()}
      onCreateFolder={jest.fn()}
      onDelete={jest.fn()}
      onRefresh={jest.fn()}
      projectPath={PROJECT_PATH}
    />,
  );

const withSettings = (settings: Record<string, unknown>) =>
  (useGetSettings as jest.Mock).mockReturnValue({ data: settings });

describe('file tree row contributions', () => {
  it('shows a contributed action and preview only on the rows they match', () => {
    const action = fileTreeRowActions.add({
      id: 'test.action',
      when: (row) => row.name.endsWith('.md'),
      Component: ActOnRow,
    });
    const preview = fileTreeHoverPreviews.add({
      id: 'test.preview',
      when: (row) => row.name.endsWith('.md'),
      Component: () => null,
    });

    const { unmount } = renderRow(`${PROJECT_PATH}/README.md`);
    expect(screen.getByText('Act on README.md')).toBeInTheDocument();
    unmount();

    renderRow(`${PROJECT_PATH}/models/a.sql`);
    expect(screen.queryByText(/Act on/)).not.toBeInTheDocument();

    action.dispose();
    preview.dispose();
  });
});

describe('pipeline rows in the file tree', () => {
  let actions: Array<{ dispose: () => void }>;

  beforeEach(() => {
    pipelineRunStore.reset();
    (isFileUnpushed as jest.Mock).mockReset().mockResolvedValue(false);
    actions = [
      fileTreeRowActions.add(pipelineCloudRunRowAction),
      fileTreeRowActions.add(pipelineLocalRunRowAction),
    ];
  });

  afterEach(() => actions.forEach((action) => action.dispose()));

  it('runs the pipeline on the cloud, by its name relative to the pipelines folder', async () => {
    withSettings({ env: 'cloud', dbtVersion: '1.9.0' });
    renderRow(PIPELINE);

    fireEvent.click(screen.getByTitle('Run Pipeline'));

    await waitFor(() =>
      expect(pipelineRunStore.getState().cloudRunArgs).toBe(
        '--pipeline_name nightly/load',
      ),
    );
    expect(
      screen.queryByTitle('Run Pipeline (Local Runner)'),
    ).not.toBeInTheDocument();
  });

  it('refuses a cloud run while the pipeline has uncommitted or unpushed changes', async () => {
    withSettings({ env: 'cloud', dbtVersion: '1.9.0' });
    const { unmount } = renderRow(PIPELINE, 'modified');
    fireEvent.click(
      screen.getByTitle('Pipeline has uncommitted changes (modified)'),
    );
    unmount();

    (isFileUnpushed as jest.Mock).mockResolvedValue(true);
    renderRow(PIPELINE);
    fireEvent.click(screen.getByTitle('Run Pipeline'));

    await waitFor(() => expect(isFileUnpushed).toHaveBeenCalledTimes(1));
    expect(isFileUnpushed).toHaveBeenCalledWith(
      PROJECT_PATH,
      'rosetta/pipelines/nightly/load.yml',
    );
    expect(pipelineRunStore.getState().cloudRunArgs).toBeNull();
  });

  it('runs the pipeline on this machine when the local runner is installed', () => {
    withSettings({ env: 'local', dbtVersion: '1.9.0', runnerPath: '/bin/r' });
    renderRow(PIPELINE);

    fireEvent.click(screen.getByTitle('Run Pipeline (Local Runner)'));

    expect(pipelineRunStore.getState().localRunFile).toBe('nightly/load.yml');
    expect(screen.queryByTitle('Run Pipeline')).not.toBeInTheDocument();
  });

  it('offers no run button without a runner, with dbt Core v2, or on other files', () => {
    withSettings({ env: 'local', dbtVersion: '1.9.0' });
    const noRunner = renderRow(PIPELINE);
    expect(screen.queryByTitle(/Run Pipeline/)).not.toBeInTheDocument();
    noRunner.unmount();

    withSettings({ env: 'cloud', dbtVersion: '2.0.0' });
    const dbtV2 = renderRow(PIPELINE);
    expect(screen.queryByTitle(/Run Pipeline/)).not.toBeInTheDocument();
    dbtV2.unmount();

    withSettings({ env: 'cloud', dbtVersion: '1.9.0' });
    renderRow(`${PROJECT_PATH}/models/schema.yml`);
    expect(screen.queryByTitle(/Run Pipeline/)).not.toBeInTheDocument();
  });
});

describe('pipeline entries in the project run menu', () => {
  let items: Array<{ dispose: () => void }>;

  beforeEach(() => {
    pipelineRunStore.reset();
    items = [
      projectMenuItems.add(pipelineRunOnCloudItem),
      projectMenuItems.add(pipelineRunLocallyItem),
    ];
  });

  afterEach(() => items.forEach((item) => item.dispose()));

  it('adds a cloud entry and a local entry', () => {
    expect(
      projectMenuItems.list().map((entry) => ({
        name: entry.name,
        cloudOnly: !!entry.cloudOnly,
        localOnly: !!entry.localOnly,
      })),
    ).toEqual([
      { name: 'Run Pipeline', cloudOnly: true, localOnly: false },
      {
        name: 'Run Pipeline (Local Runner)',
        cloudOnly: false,
        localOnly: true,
      },
    ]);
  });

  it('opens the pipeline picker for the chosen way of running', () => {
    const context = {
      project: {} as never,
      settings: { runnerPath: '/r' } as never,
    };

    pipelineRunOnCloudItem.onSelect(context);
    expect(pipelineRunStore.getState().selectorMode).toBe('cloud');

    pipelineRunLocallyItem.onSelect(context);
    expect(pipelineRunStore.getState().selectorMode).toBe('local');
  });

  it('does not open the local picker when the runner is missing', () => {
    pipelineRunLocallyItem.onSelect({
      project: {} as never,
      settings: {} as never,
    });

    expect(pipelineRunStore.getState().selectorMode).toBeNull();
  });
});
