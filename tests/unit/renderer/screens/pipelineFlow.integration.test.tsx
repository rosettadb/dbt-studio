import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';

import Dashboard from '../../../../src/renderer/screens/dashboard';
import SelectProject from '../../../../src/renderer/screens/selectProject';

// Flow test: the real Dashboard and project list screens behind a real router.
// Only data loading and the backend are mocked. The project screen is a probe
// that shows the navigation state it received; the real project screen opens
// Create Pipeline when that state has `openCreatePipeline: true`.

// Each test renders both full screens; under full-suite load that can pass
// the default 10s limit.
jest.setTimeout(30000);

const mockSelectProject = jest.fn();
const mockAddProject = jest.fn();

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: () => null,
}));

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    addProject: (...args: unknown[]) => mockAddProject(...args),
    addProjectFromFolder: jest.fn(),
  },
  connectorsServices: { saveConnection: jest.fn() },
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useDeleteProject: () => ({ mutate: jest.fn() }),
  useRemoveProjectFromList: () => ({ mutate: jest.fn() }),
  useFilePicker: () => ({ mutate: jest.fn() }),
  useGetConnections: () => ({ data: [], isLoading: false }),
  useGetProjects: () => ({
    data: [{ id: '1', name: 'jaffle_shop', path: '/p/jaffle_shop' }],
  }),
  useGetSettings: () => ({ data: { projectsDirectory: '/p' } }),
  useSelectProject: () => ({ mutateAsync: mockSelectProject }),
  useUpdateProject: () => ({ mutate: jest.fn() }),
  useDuckLakeInstances: () => ({ data: [], isLoading: false }),
  useGetProjectGitSummary: () => ({ data: undefined, isLoading: false }),
}));

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({ setIsSidebarOpen: jest.fn() }),
}));

jest.mock('../../../../src/renderer/components', () => ({
  QuickStartTour: () => null,
  hasSeenTour: () => true,
  markTourSeen: jest.fn(),
  AddConnectionModal: () => null,
  CloneRepoModal: () => null,
  GetStartedModal: () => null,
  Icon: () => null,
  // Stand-in for the New Project form: fill a valid name, then submit.
  NewProject: ({ newProject, setNewProject, handleAddProject }: any) => (
    <div data-testid="new-project-form">
      <button
        type="button"
        onClick={() => setNewProject({ ...newProject, name: 'pipeline_proj' })}
      >
        Fill name
      </button>
      <button type="button" onClick={handleAddProject}>
        Create project
      </button>
    </div>
  ),
}));

jest.mock('../../../../src/renderer/layouts', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../../../../assets', () => ({
  icons: {},
  rosettaIcon: 'rosetta.png',
}));

jest.mock('../../../../src/renderer/assets/icons/lucide/route.svg', () => ({
  ReactComponent: () => null,
}));

const PIPELINE_NOTE =
  'Pick the project to add a pipeline to, or create a new one.';

const ProjectScreenProbe: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid="project-screen-state">
        {JSON.stringify(location.state)}
      </div>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
    </div>
  );
};

const renderApp = () =>
  render(
    <MemoryRouter
      initialEntries={['/app']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/app" element={<Dashboard />} />
        <Route path="/app/select-project" element={<SelectProject />} />
        <Route path="/app/dbt-project" element={<ProjectScreenProbe />} />
      </Routes>
    </MemoryRouter>,
  );

const projectScreenState = async () =>
  JSON.parse(
    (await screen.findByTestId('project-screen-state')).textContent ?? 'null',
  );

describe('Dashboard Pipeline flow', () => {
  beforeEach(() => {
    mockSelectProject.mockReset().mockResolvedValue(undefined);
    mockAddProject.mockReset();
  });

  it('adds a pipeline to an existing project', async () => {
    renderApp();

    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Existing project'));

    expect(await screen.findByText(PIPELINE_NOTE)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('project-card-jaffle_shop'));

    expect(await projectScreenState()).toEqual({ openCreatePipeline: true });
    expect(mockSelectProject).toHaveBeenCalledWith({ projectId: '1' });
  });

  it('creates a new project with a pipeline', async () => {
    mockAddProject.mockResolvedValue({ id: '9', name: 'pipeline_proj' });
    renderApp();

    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('New project'));

    expect(await screen.findByTestId('new-project-form')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Fill name'));
    fireEvent.click(screen.getByText('Create project'));

    expect(await projectScreenState()).toEqual({ openCreatePipeline: true });
    expect(mockSelectProject).toHaveBeenCalledWith({ projectId: '9' });
  });

  it('leaves pipeline mode when going Back to the project list', async () => {
    renderApp();

    fireEvent.click(screen.getByText('Pipeline'));
    fireEvent.click(screen.getByText('Existing project'));
    fireEvent.click(await screen.findByTestId('project-card-jaffle_shop'));
    await projectScreenState();

    fireEvent.click(screen.getByText('Back'));

    expect(await screen.findByTestId('project-list')).toBeInTheDocument();
    expect(screen.queryByText(PIPELINE_NOTE)).toBeNull();

    fireEvent.click(screen.getByTestId('project-card-jaffle_shop'));
    await waitFor(() =>
      expect(screen.getByTestId('project-screen-state')).toHaveTextContent(
        'null',
      ),
    );
  });
});
