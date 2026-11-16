import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import Dashboard from '../../../../src/renderer/screens/dashboard';
import {
  useApiKey,
  useGetConnections,
  useGetProjects,
  useProfile,
} from '../../../../src/renderer/controllers';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: jest.fn(),
  useGetConnections: jest.fn(),
  useSelectProject: () => ({ mutateAsync: jest.fn() }),
  useApiKey: jest.fn(),
  useAuthLogin: () => ({ mutate: jest.fn(), isLoading: false }),
  useProfile: jest.fn(),
}));

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ setIsSidebarOpen: jest.fn() }),
}));

jest.mock('../../../../src/renderer/components', () => ({
  QuickStartTour: () => null,
  hasSeenTour: () => true,
  markTourSeen: jest.fn(),
}));

jest.mock('../../../../src/renderer/components/commandPalette', () => ({
  CommandPalette: () => <button type="button">Global search</button>,
}));

jest.mock(
  '../../../../src/renderer/components/menu/CloudLocalEnvironmentSwitch',
  () => ({
    CloudLocalEnvironmentSwitch: () => (
      <button type="button">Cloud / Local switch</button>
    ),
  }),
);

jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: (type?: string) =>
    type === 'duckdb' ? 'duckdb.png' : undefined,
}));

jest.mock('../../../../assets', () => ({
  icons: {},
  rosettaIcon: 'rosetta.png',
}));

jest.mock('../../../../src/renderer/assets/icons/lucide/route.svg', () => ({
  ReactComponent: () => null,
}));

const buildProjects = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    name: `project_${index + 1}`,
    path: `/projects/project_${index + 1}`,
  }));

const buildConnections = (count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    connection: { name: `connection_${index + 1}`, type: 'postgres' },
  }));

const renderDashboard = ({
  projects = buildProjects(1),
  connections = buildConnections(1),
}: {
  projects?: unknown[];
  connections?: unknown[];
} = {}) => {
  (useGetProjects as jest.Mock).mockReturnValue({ data: projects });
  (useGetConnections as jest.Mock).mockReturnValue({ data: connections });
  return render(<Dashboard />);
};

const button = (name: string | RegExp) => screen.getByRole('button', { name });

const isBefore = (first: HTMLElement, second: HTMLElement) =>
  // eslint-disable-next-line no-bitwise
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

const getRow = (text: string) =>
  screen.getByText(text).closest('[role="button"]') as HTMLElement;

describe('Dashboard panels', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useApiKey as jest.Mock).mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    (useProfile as jest.Mock).mockReturnValue({ data: undefined });
  });

  describe('Recent Projects', () => {
    it('lists only the 3 most recently opened projects, newest first', () => {
      renderDashboard({
        projects: [
          { id: '1', name: 'never_opened', path: '/projects/never_opened' },
          { id: '2', name: 'oldest', path: '/a', lastOpenedAt: 100 },
          { id: '3', name: 'newest', path: '/b', lastOpenedAt: 300 },
          { id: '4', name: 'middle', path: '/c', lastOpenedAt: 200 },
        ],
      });

      expect(screen.queryByText('never_opened')).not.toBeInTheDocument();
      expect(
        isBefore(screen.getByText('newest'), screen.getByText('middle')),
      ).toBe(true);
      expect(
        isBefore(screen.getByText('middle'), screen.getByText('oldest')),
      ).toBe(true);
    });

    it('hides Manage All Projects when every project is already listed', () => {
      renderDashboard({ projects: buildProjects(3) });

      expect(
        screen.queryByRole('button', { name: 'Manage All Projects' }),
      ).not.toBeInTheDocument();
    });

    it('shows Manage All Projects when some are hidden and opens the projects page', () => {
      renderDashboard({ projects: buildProjects(4) });

      fireEvent.click(button('Manage All Projects'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/select-project');
    });

    it('New Project opens the new project form on the projects page', () => {
      renderDashboard();

      fireEvent.click(button('New Project'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
        state: { startNewProject: true },
      });
    });
  });

  describe('Configured Connections', () => {
    it('lists only the first 3 connections', () => {
      renderDashboard({ connections: buildConnections(4) });

      expect(screen.getByText('connection_3')).toBeInTheDocument();
      expect(screen.queryByText('connection_4')).not.toBeInTheDocument();
    });

    it('hides Manage All Connections when every connection is already listed', () => {
      renderDashboard({ connections: buildConnections(3) });

      expect(
        screen.queryByRole('button', { name: 'Manage All Connections' }),
      ).not.toBeInTheDocument();
    });

    it('shows Manage All Connections when some are hidden and opens the connections page', () => {
      renderDashboard({ connections: buildConnections(4) });

      fireEvent.click(button('Manage All Connections'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/connections');
    });

    it('New Connection opens the add connection page', () => {
      renderDashboard();

      fireEvent.click(button('New Connection'));

      expect(mockNavigate).toHaveBeenCalledWith('/app/add-connection');
    });

    it('no longer has a Manage button', () => {
      renderDashboard();

      expect(
        screen.queryByRole('button', { name: 'Manage' }),
      ).not.toBeInTheDocument();
    });

    it("shows each connection's database logo, or the database icon without one", () => {
      renderDashboard({
        connections: [
          { id: '1', connection: { name: 'Local DuckDB', type: 'duckdb' } },
          { id: '2', connection: { name: 'Mystery', type: 'not-a-type' } },
        ],
      });

      expect(
        within(getRow('Local DuckDB')).getByAltText('duckdb'),
      ).toHaveAttribute('src', 'duckdb.png');
      expect(
        within(getRow('Mystery')).getByTestId('StorageIcon'),
      ).toBeInTheDocument();
    });

    it('uses the Database Connections plug icon in its title', () => {
      renderDashboard();

      const title = screen.getByText(/Configured Connections/);

      expect(
        within(title).getByTestId('ElectricalServicesIcon'),
      ).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('shows search, then Connect to Cloud, then Settings', () => {
      renderDashboard();

      const search = button('Global search');
      const cloud = button(/Connect to Cloud/);
      const settings = button('Settings');

      expect(isBefore(search, cloud)).toBe(true);
      expect(isBefore(cloud, settings)).toBe(true);
    });

    it('turns Connect to Cloud into the Cloud / Local switch once logged in', () => {
      (useApiKey as jest.Mock).mockReturnValue({
        data: 'key',
        isLoading: false,
      });
      (useProfile as jest.Mock).mockReturnValue({ data: { id: 'user' } });

      renderDashboard();

      expect(button('Cloud / Local switch')).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Connect to Cloud/ }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Cloud Dashboard/ }),
      ).not.toBeInTheDocument();
    });

    it('waits for the profile before showing the switch', () => {
      (useApiKey as jest.Mock).mockReturnValue({
        data: 'key',
        isLoading: false,
      });

      renderDashboard();

      expect(
        screen.queryByRole('button', { name: 'Cloud / Local switch' }),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Connect to Cloud/ }),
      ).not.toBeInTheDocument();
    });
  });
});
