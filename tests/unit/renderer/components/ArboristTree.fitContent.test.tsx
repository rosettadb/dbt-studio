/**
 * ArboristTree with `fitContent` (the project folder trees in the Notebooks,
 * Queries and Analytics tabs): a file added to the folder shows once the
 * folder listing is refetched, including the first file in a folder and a
 * folder that appears with its first file (plan 95c / 95d).
 */
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { ArboristTree } from '../../../../src/renderer/components/fileTreeViewer/ArboristTree';
import { FileNode } from '../../../../src/types/backend';

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {},
}));

// Rows render their name only; the real TreeNode pulls in most of the app
jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/TreeNode',
  () => ({
    TREE_INDENT: 16,
    TreeNode: ({ node, style }: any) => (
      <div style={style} data-testid="row">
        {node.data.name}
      </div>
    ),
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

const ROOT = '/projects/shop/notebooks';

const folder = (...files: string[]): FileNode => ({
  id: ROOT,
  name: 'notebooks',
  path: ROOT,
  type: 'folder',
  children: files.map((name) => ({
    id: `${ROOT}/${name}`,
    name,
    path: `${ROOT}/${name}`,
    type: 'file',
  })),
});

const tree = (data: FileNode) => (
  <ArboristTree
    fitContent
    data={data}
    fileStatuses={{}}
    onFileSelect={jest.fn()}
    onRefresh={jest.fn()}
    onCreateFile={jest.fn()}
    onCreateFolder={jest.fn()}
    onDeleteSuccess={jest.fn()}
    projectPath={ROOT}
    copyPath={jest.fn()}
  />
);

// The root opens in an effect and the height is re-read in a frame
const settle = async () => {
  await act(async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  });
};

describe('ArboristTree fitContent', () => {
  it('shows a file added to an empty folder', async () => {
    const { rerender } = render(tree(folder()));
    await settle();
    expect(screen.queryByText('new.ipynb')).not.toBeInTheDocument();

    rerender(tree(folder('new.ipynb')));
    await settle();

    expect(screen.getByText('new.ipynb')).toBeInTheDocument();
  });

  it('shows the files of a folder that mounts with them', async () => {
    render(tree(folder('a.sql', 'b.sql')));
    await settle();

    expect(screen.getByText('a.sql')).toBeInTheDocument();
    expect(screen.getByText('b.sql')).toBeInTheDocument();
  });

  it('shows a file added next to existing ones', async () => {
    const { rerender } = render(tree(folder('a.md')));
    await settle();

    rerender(tree(folder('a.md', 'b.md')));
    await settle();

    expect(screen.getByText('b.md')).toBeInTheDocument();
  });
});
