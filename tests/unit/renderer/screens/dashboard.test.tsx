import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import Dashboard from '../../../../src/renderer/screens/dashboard';
import {
  useGetConnections,
  useGetProjects,
  useSelectProject,
} from '../../../../src/renderer/controllers';

const mockNavigate = jest.fn();

// The Dashboard watches its size to fit the window; jsdom has no ResizeObserver
window.ResizeObserver = jest.fn(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
})) as unknown as typeof ResizeObserver;

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: jest.fn(),
  useGetConnections: jest.fn(),
  useSelectProject: jest.fn(),
  useApiKey: () => ({ data: undefined, isLoading: false }),
  useAuthLogin: () => ({ mutate: jest.fn(), isLoading: false }),
  useProfile: () => ({ data: undefined }),
}));

// The Dashboard header's search and Cloud / Local switch have their own tests
jest.mock('../../../../src/renderer/components/commandPalette', () => ({
  CommandPalette: () => null,
}));

jest.mock(
  '../../../../src/renderer/components/menu/CloudLocalEnvironmentSwitch',
  () => ({ CloudLocalEnvironmentSwitch: () => null }),
);

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({
    setIsSidebarOpen: jest.fn(),
    selectedProject: undefined,
  }),
}));

jest.mock('../../../../src/renderer/components', () => ({
  QuickStartTour: () => null,
  hasSeenTour: () => true,
  markTourSeen: jest.fn(),
}));

jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: (type?: string) =>
    type === 'snowflake' ? 'snowflake.png' : undefined,
}));

jest.mock('../../../../assets', () => ({
  icons: {},
  rosettaIcon: 'rosetta.png',
}));

jest.mock(
  '../../../../src/extensions/pipeline/renderer/assets/route.svg',
  () => ({
    ReactComponent: () => null,
  }),
);

const renderDashboard = (projects: unknown[]) => {
  (useGetProjects as jest.Mock).mockReturnValue({ data: projects });
  return render(<Dashboard />);
};

const getProjectRow = (projectName: string) =>
  screen.getByText(projectName).closest('[role="button"]') as HTMLElement;

describe('Dashboard Recent Projects', () => {
  const selectProject = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    selectProject.mockResolvedValue(undefined);
    (useGetConnections as jest.Mock).mockReturnValue({ data: [] });
    (useSelectProject as jest.Mock).mockReturnValue({
      mutateAsync: selectProject,
    });
  });

  it('shows the database logo for a project with a connection', () => {
    renderDashboard([
      {
        id: '1',
        name: 'with_connection',
        path: '/projects/a',
        connection: { type: 'snowflake', name: 'Snowflake Connection' },
      },
    ]);

    const logo = within(getProjectRow('with_connection')).getByAltText(
      'snowflake',
    );

    expect(logo).toHaveAttribute('src', 'snowflake.png');
  });

  it('shows the Manage Projects database icon for a project with no connection', () => {
    renderDashboard([{ id: '1', name: 'no_connection', path: '/projects/a' }]);

    const row = getProjectRow('no_connection');

    expect(within(row).getByTestId('StorageIcon')).toBeInTheDocument();
    expect(within(row).queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows the same database icon when a connection type has no logo', () => {
    renderDashboard([
      {
        id: '1',
        name: 'unknown_type',
        path: '/projects/a',
        connection: { type: 'not-a-real-type', name: 'Mystery' },
      },
    ]);

    expect(
      within(getProjectRow('unknown_type')).getByTestId('StorageIcon'),
    ).toBeInTheDocument();
  });

  it('no longer shows the old folder icon', () => {
    renderDashboard([{ id: '1', name: 'no_connection', path: '/projects/a' }]);

    expect(screen.queryByTestId('FolderSpecialIcon')).not.toBeInTheDocument();
  });

  it('still opens the project when its row is clicked', async () => {
    renderDashboard([
      {
        id: '1',
        name: 'with_connection',
        path: '/projects/a',
        connection: { type: 'snowflake', name: 'Snowflake Connection' },
      },
    ]);

    fireEvent.click(getProjectRow('with_connection'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project'),
    );
    expect(selectProject).toHaveBeenCalledWith({ projectId: '1' });
  });
});
