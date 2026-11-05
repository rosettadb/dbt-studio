import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FileTreeViewer } from '../../../../src/renderer/components/fileTreeViewer';
import { FileNode } from '../../../../src/types/backend';

jest.mock('../../../../src/renderer/components/modals', () => ({
  NewFileModal: () => null,
}));

// The same objects every render, like react-query returns, so the component's
// effects that depend on them don't re-run forever.
const mockSelectedProject = {
  data: { id: 'p1', name: 'Shop', path: '/projects/shop' },
};
const mockSettings = { data: {} };

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetSelectedProject: () => mockSelectedProject,
  useGetSettings: () => mockSettings,
}));

jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/ArboristTree',
  () => ({
    ArboristTree: ({ data }: { data: { path: string } }) => (
      <div data-testid="tree-root">{data.path}</div>
    ),
  }),
);

const projectFolder = {
  path: '/projects/shop',
  type: 'folder',
  children: [],
} as unknown as FileNode;

const renderFileTreeViewer = (
  refreshFiles: () => void,
  isLoadingFiles = false,
) =>
  render(
    <FileTreeViewer
      node={projectFolder}
      onFileSelect={jest.fn()}
      isLoadingFiles={isLoadingFiles}
      refreshFiles={refreshFiles}
      onDeleteFileCallback={jest.fn()}
      onNewFileCallback={jest.fn()}
      statuses={[]}
      copyPath={jest.fn()}
    />,
  );

describe('FileTreeViewer', () => {
  it('has no search box, because file search lives in the global search', () => {
    renderFileTreeViewer(jest.fn());

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('passes the whole project tree to the tree view', () => {
    renderFileTreeViewer(jest.fn());

    expect(screen.getByTestId('tree-root')).toHaveTextContent('/projects/shop');
  });

  it('refreshes the files when the refresh icon is clicked', () => {
    const refreshFiles = jest.fn();
    renderFileTreeViewer(refreshFiles);

    fireEvent.click(screen.getByLabelText('Refresh directories'));

    expect(refreshFiles).toHaveBeenCalledTimes(1);
  });

  it('shows a spinner in place of the refresh icon while loading', () => {
    renderFileTreeViewer(jest.fn(), true);

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
