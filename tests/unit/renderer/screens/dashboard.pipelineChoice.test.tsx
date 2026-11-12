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
} from '../../../../src/renderer/controllers';

// The Dashboard Pipeline card asks whether the pipeline goes into a new or an
// existing project, then hands that choice to the project list.

const mockNavigate = jest.fn();
const mockSetIsSidebarOpen = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: jest.fn(),
  useGetConnections: jest.fn(),
  useSelectProject: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ setIsSidebarOpen: mockSetIsSidebarOpen }),
}));

jest.mock('../../../../src/renderer/components', () => ({
  QuickStartTour: () => null,
  hasSeenTour: () => true,
  markTourSeen: jest.fn(),
}));

jest.mock('../../../../assets', () => ({
  icons: {},
  rosettaIcon: 'rosetta.png',
}));

jest.mock('../../../../src/renderer/assets/icons/lucide/route.svg', () => ({
  ReactComponent: () => null,
}));

const oneProject = [{ id: '1', name: 'jaffle_shop', path: '/p/jaffle_shop' }];

const renderDashboard = (projects: unknown[] = oneProject) => {
  (useGetProjects as jest.Mock).mockReturnValue({ data: projects });
  (useGetConnections as jest.Mock).mockReturnValue({ data: [] });
  return render(<Dashboard />);
};

const clickPipelineCard = () => fireEvent.click(screen.getByText('Pipeline'));

const queryPipelineChoiceDialog = () =>
  screen.queryByRole('dialog', { name: 'Where should the pipeline go?' });

describe('Dashboard Pipeline card', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSetIsSidebarOpen.mockClear();
  });

  it('asks where the pipeline should go instead of opening the last project', () => {
    renderDashboard();

    clickPipelineCard();

    const dialog = queryPipelineChoiceDialog();
    expect(dialog).toBeInTheDocument();
    expect(within(dialog!).getByText('New project')).toBeInTheDocument();
    expect(within(dialog!).getByText('Existing project')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('opens the New Project form in pipeline mode when "New project" is chosen', async () => {
    renderDashboard();

    clickPipelineCard();
    fireEvent.click(screen.getByText('New project'));

    expect(mockSetIsSidebarOpen).toHaveBeenCalledWith(true);
    expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
      state: { forPipeline: true, startNewProject: true },
    });
    await waitFor(() => expect(queryPipelineChoiceDialog()).toBeNull());
  });

  it('opens the project list in pipeline mode when "Existing project" is chosen', async () => {
    renderDashboard();

    clickPipelineCard();
    fireEvent.click(screen.getByText('Existing project'));

    expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
      state: { forPipeline: true, startNewProject: false },
    });
    await waitFor(() => expect(queryPipelineChoiceDialog()).toBeNull());
  });

  it('closes the dialog without navigating when Cancel is clicked', async () => {
    renderDashboard();

    clickPipelineCard();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(queryPipelineChoiceDialog()).toBeNull());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('goes straight to the New Project form when there are no projects yet', () => {
    renderDashboard([]);

    clickPipelineCard();

    expect(queryPipelineChoiceDialog()).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
      state: { forPipeline: true, startNewProject: true },
    });
  });
});
