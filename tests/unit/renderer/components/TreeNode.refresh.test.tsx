import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { NodeApi } from 'react-arborist';
import { TreeNode } from '../../../../src/renderer/components/fileTreeViewer/TreeNode';
import { FileNode } from '../../../../src/types/backend';

jest.mock('file-icons-js', () => ({ getClassWithColor: () => '' }));

jest.mock('../../../../src/renderer/services/git.service', () => ({
  isFileUnpushed: jest.fn(),
}));

jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/PipelineThumbnailPreview',
  () => ({ PipelineThumbnailPreview: () => null }),
);

const PROJECT_PATH = '/projects/shop';

const folderNode = (folderPath: string, level: number) =>
  ({
    data: {
      id: folderPath,
      name: folderPath.split('/').pop(),
      path: folderPath,
      type: 'folder',
      children: [],
    } as FileNode,
    level,
    isEditing: false,
    isSelected: false,
    isOpen: true,
    toggle: jest.fn(),
  }) as unknown as NodeApi<FileNode>;

const renderRow = (node: NodeApi<FileNode>, onRefresh = jest.fn()) => {
  render(
    <TreeNode
      node={node}
      style={{}}
      dragHandle={undefined}
      tree={{} as never}
      fileStatuses={{}}
      onContextMenu={jest.fn()}
      onCreateFile={jest.fn()}
      onCreateFolder={jest.fn()}
      onDelete={jest.fn()}
      onRefresh={onRefresh}
      projectPath={PROJECT_PATH}
    />,
  );
  return onRefresh;
};

describe('TreeNode refresh button', () => {
  it('refreshes the project files from the project folder row', () => {
    const onRefresh = renderRow(folderNode(PROJECT_PATH, 0));

    fireEvent.click(screen.getByTitle('Refresh directories'));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps it visible, outside the buttons that only show on hover', () => {
    renderRow(folderNode(PROJECT_PATH, 0));

    const refreshButton = screen.getByTitle('Refresh directories');

    expect(refreshButton.closest('.node-actions')).toBeNull();
    expect(
      screen.getByTitle('New File').closest('.node-actions'),
    ).not.toBeNull();
  });

  it('has no refresh button on other folders', () => {
    renderRow(folderNode(`${PROJECT_PATH}/models`, 1));

    expect(screen.queryByTitle('Refresh directories')).not.toBeInTheDocument();
  });
});
