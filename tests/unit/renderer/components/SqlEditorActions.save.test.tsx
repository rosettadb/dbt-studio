/**
 * SQL Editor Save (plan 95d). One tab per connection:
 * - its text came from a saved query selected in the sidebar: Save updates
 *   that query (the project .sql file or the Local query);
 * - its text is the user's own: Save asks for a name and a place.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SqlEditorActions } from '../../../../src/renderer/components/sqlEditor/SqlEditorActions';
import type { SqlTabSource } from '../../../../src/types/editor';

const mockSaveFileContent = jest.fn((...args: unknown[]) =>
  Promise.resolve(args.length > 0),
);
const mockUpdateLocalQuery = jest.fn((...args: unknown[]) =>
  Promise.resolve({ args }),
);
const mockCreateLocalQuery = jest.fn();

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    saveFileContent: (...args: unknown[]) => mockSaveFileContent(...args),
  },
}));

jest.mock(
  '../../../../src/renderer/controllers/savedQueries.controller',
  () => ({
    useCreateSavedQuery: () => ({ mutateAsync: mockCreateLocalQuery }),
    useUpdateSavedQuery: () => ({ mutateAsync: mockUpdateLocalQuery }),
    useGetSavedQueries: () => ({ data: [] }),
  }),
);

jest.mock(
  '../../../../src/renderer/components/projectFolders/ProjectFolderTree',
  () => ({ useConnectionProject: () => undefined }),
);

jest.mock('../../../../src/renderer/components/sqlEditor/queryHistory', () => ({
  QueryHistory: () => null,
}));

jest.mock('react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const renderActions = (source?: SqlTabSource, onSavedAs = jest.fn()) =>
  render(
    <SqlEditorActions
      connectionId="c1"
      query="select 42"
      queryHistory={[]}
      onQuerySelect={jest.fn()}
      source={source}
      onSavedAs={onSavedAs}
    />,
  );

describe('SqlEditorActions Save', () => {
  beforeEach(() => jest.clearAllMocks());

  it('updates the selected project .sql file', async () => {
    renderActions({
      kind: 'project',
      filePath: '/p/queries/top.sql',
      name: 'top.sql',
    });

    fireEvent.click(screen.getByTestId('sql-save-btn'));

    await waitFor(() =>
      expect(mockSaveFileContent).toHaveBeenCalledWith({
        path: '/p/queries/top.sql',
        content: 'select 42',
      }),
    );
    expect(screen.queryByText('Save Query')).not.toBeInTheDocument();
  });

  it('updates the selected Local query', async () => {
    renderActions({ kind: 'local', queryId: 'q1', name: 'Query #1' });

    fireEvent.click(screen.getByTestId('sql-save-btn'));

    await waitFor(() =>
      expect(mockUpdateLocalQuery).toHaveBeenCalledWith({
        connectionId: 'c1',
        queryId: 'q1',
        updates: { query: 'select 42' },
      }),
    );
  });

  it('asks for a name when the text is not from a saved query', async () => {
    const onSavedAs = jest.fn();
    mockCreateLocalQuery.mockResolvedValue({
      id: 'q9',
      name: 'Query #1',
      query: 'select 42',
    });
    renderActions(undefined, onSavedAs);

    fireEvent.click(screen.getByTestId('sql-save-btn'));
    fireEvent.click(await screen.findByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSavedAs).toHaveBeenCalledWith({
        kind: 'local',
        queryId: 'q9',
        name: 'Query #1',
      }),
    );
    expect(mockSaveFileContent).not.toHaveBeenCalled();
    expect(mockUpdateLocalQuery).not.toHaveBeenCalled();
  });

  it('saves with Ctrl+S', async () => {
    renderActions({
      kind: 'project',
      filePath: '/p/queries/top.sql',
      name: 'top.sql',
    });

    fireEvent.keyDown(window, { key: 's', ctrlKey: true });

    await waitFor(() => expect(mockSaveFileContent).toHaveBeenCalled());
  });
});
