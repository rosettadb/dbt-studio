import React from 'react';
import { render } from '@testing-library/react';
import { ArboristTree } from '../../../../src/renderer/components/fileTreeViewer/ArboristTree';
import { FileNode } from '../../../../src/types/backend';

const mockTreeOpen = jest.fn();
const mockTreeSelect = jest.fn();

jest.mock('react-arborist', () => {
  // eslint-disable-next-line global-require
  const { forwardRef, useImperativeHandle } = require('react');
  return {
    Tree: forwardRef((_props: unknown, ref: unknown) => {
      useImperativeHandle(ref, () => ({
        get: () => null,
        open: mockTreeOpen,
        select: mockTreeSelect,
      }));
      return null;
    }),
  };
});

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {},
}));

jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/TreeNode',
  () => ({
    TREE_INDENT: 16,
    TreeNode: () => null,
  }),
);

jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/TreeContextMenu',
  () => ({ TreeContextMenu: () => null }),
);

jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/ExternalDropZone',
  () => ({
    ExternalDropZone: ({ children }: { children: unknown }) => children,
  }),
);

const FOLDER_PATH = '/projects/shop/models/staging';

const projectFolder = {
  id: '/projects/shop',
  name: 'shop',
  path: '/projects/shop',
  type: 'folder',
  children: [],
} as FileNode;

const renderTree = (props: {
  revealFolderPath?: string | null;
  onFolderRevealed?: () => void;
}) =>
  render(
    <ArboristTree
      data={projectFolder}
      fileStatuses={{}}
      onFileSelect={jest.fn()}
      onRefresh={jest.fn()}
      onCreateFile={jest.fn()}
      onCreateFolder={jest.fn()}
      onDeleteSuccess={jest.fn()}
      projectPath="/projects/shop"
      copyPath={jest.fn()}
      revealFolderPath={props.revealFolderPath}
      onFolderRevealed={props.onFolderRevealed}
    />,
  );

describe('ArboristTree revealing a folder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens and selects the folder, then says it is done', () => {
    const onFolderRevealed = jest.fn();

    renderTree({ revealFolderPath: FOLDER_PATH, onFolderRevealed });

    expect(mockTreeOpen).toHaveBeenCalledWith(FOLDER_PATH);
    expect(mockTreeSelect).toHaveBeenCalledWith(FOLDER_PATH);
    expect(onFolderRevealed).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no folder was asked for', () => {
    const onFolderRevealed = jest.fn();

    renderTree({ revealFolderPath: null, onFolderRevealed });

    expect(mockTreeSelect).not.toHaveBeenCalled();
    expect(onFolderRevealed).not.toHaveBeenCalled();
  });
});
