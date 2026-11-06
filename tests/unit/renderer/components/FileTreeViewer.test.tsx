import React from 'react';
import { render, screen } from '@testing-library/react';
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

const renderFileTreeViewer = () =>
  render(
    <FileTreeViewer
      node={projectFolder}
      onFileSelect={jest.fn()}
      refreshFiles={jest.fn()}
      onDeleteFileCallback={jest.fn()}
      onNewFileCallback={jest.fn()}
      statuses={[]}
      copyPath={jest.fn()}
    />,
  );

describe('FileTreeViewer', () => {
  it('has no search box, because file search lives in the global search', () => {
    renderFileTreeViewer();

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('has no refresh button, because it lives in the panel tab row', () => {
    renderFileTreeViewer();

    expect(
      screen.queryByLabelText('Refresh directories'),
    ).not.toBeInTheDocument();
  });

  it('passes the whole project tree to the tree view', () => {
    renderFileTreeViewer();

    expect(screen.getByTestId('tree-root')).toHaveTextContent('/projects/shop');
  });
});
