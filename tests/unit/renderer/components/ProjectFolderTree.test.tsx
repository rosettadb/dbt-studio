/**
 * ProjectFolderTree (Queries and Analytics tabs, plan 95d): the project's
 * folder row always shows, even before the folder exists, with the empty
 * text under it; its files show once there are some.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from 'react-query';
import {
  ProjectFolderTree,
  SavedInStudioHeading,
} from '../../../../src/renderer/components/projectFolders/ProjectFolderTree';
import type { FileNode, Project } from '../../../../src/types/backend';

const mockLoadProjectDirectory = jest.fn();

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    loadProjectDirectory: (...args: unknown[]) =>
      mockLoadProjectDirectory(...args),
  },
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: () => ({ data: [] }),
  useGitIsInitialized: () => ({ data: false }),
  useGetFileStatuses: () => ({ data: [] }),
}));

jest.mock('../../../../src/projectTypes/registry.renderer', () => ({
  projectTypeUiOf: () => ({ Icon: () => null }),
}));

jest.mock('../../../../src/renderer/components/modals/newFileModal', () => ({
  NewFileModal: () => null,
}));

// Rows render their name only; the real TreeNode pulls in most of the app
jest.mock(
  '../../../../src/renderer/components/fileTreeViewer/TreeNode',
  () => ({
    TREE_INDENT: 8,
    // Marks which create actions each row was given
    TreeNode: ({ node, style, onCreateFile, onCreateFolder }: any) => (
      <div
        style={style}
        data-testid={`row-${node.data.name}`}
        data-new-file={onCreateFile ? 'yes' : 'no'}
        data-new-folder={onCreateFolder ? 'yes' : 'no'}
      >
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

const project = {
  id: '1',
  name: 'shop',
  path: '/projects/shop',
  createdAt: '',
  type: 'analytics',
} as Project;

const renderTree = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProjectFolderTree
        project={project}
        folderName="queries"
        fileExtension=".sql"
        filter=""
        onOpenFile={jest.fn()}
        emptyText="No queries yet."
        testId="project-queries"
      />
    </QueryClientProvider>,
  );

describe('ProjectFolderTree', () => {
  beforeEach(() => {
    mockLoadProjectDirectory.mockReset();
  });

  it('shows the folder row and the empty text when the folder does not exist', async () => {
    mockLoadProjectDirectory.mockRejectedValue(new Error('ENOENT'));

    renderTree();

    expect(await screen.findByText('queries')).toBeInTheDocument();
    expect(screen.getByText('No queries yet.')).toBeInTheDocument();
  });

  it('shows the files and no empty text when the folder has some', async () => {
    const folder: FileNode = {
      id: '/projects/shop/queries',
      name: 'queries',
      path: '/projects/shop/queries',
      type: 'folder',
      children: [
        {
          id: '/projects/shop/queries/top.sql',
          name: 'top.sql',
          path: '/projects/shop/queries/top.sql',
          type: 'file',
        },
      ],
    };
    mockLoadProjectDirectory.mockResolvedValue(folder);

    renderTree();

    expect(await screen.findByText('top.sql')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText('No queries yet.')).not.toBeInTheDocument(),
    );
  });

  it('offers New File on the folder row only, and New Folder nowhere', async () => {
    mockLoadProjectDirectory.mockResolvedValue({
      id: '/projects/shop/queries',
      name: 'queries',
      path: '/projects/shop/queries',
      type: 'folder',
      children: [
        {
          id: '/projects/shop/queries/dev',
          name: 'dev',
          path: '/projects/shop/queries/dev',
          type: 'folder',
          children: [],
        },
      ],
    } as FileNode);

    renderTree();

    const root = await screen.findByTestId('row-queries');
    const subfolder = await screen.findByTestId('row-dev');
    expect(root).toHaveAttribute('data-new-file', 'yes');
    expect(subfolder).toHaveAttribute('data-new-file', 'no');
    expect(root).toHaveAttribute('data-new-folder', 'no');
    expect(subfolder).toHaveAttribute('data-new-folder', 'no');
  });
});

describe('Local folder row', () => {
  it('offers a + button that creates a local item', () => {
    const onCreate = jest.fn();
    render(
      <SavedInStudioHeading
        onCreate={onCreate}
        createTitle="New Local Query"
      />,
    );

    expect(screen.getByText('Local')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New Local Query' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('has no + button when nothing can be created', () => {
    render(<SavedInStudioHeading />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
