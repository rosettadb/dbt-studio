import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SelectProject from '../../../../src/renderer/screens/selectProject';

// Arriving from the Dashboard Pipeline card puts the project list in pipeline
// mode: whichever project is picked, created or imported opens with the
// Create Pipeline dialog.

const mockNavigate = jest.fn();
let mockLocation: { pathname: string; state: unknown } = {
  pathname: '/app/select-project',
  state: null,
};
const mockSelectProject = jest.fn();
const mockAddProject = jest.fn();
const mockAddProjectFromFolder = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockLocation,
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: () => null,
}));

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {
    addProject: (...args: unknown[]) => mockAddProject(...args),
    addProjectFromFolder: (...args: unknown[]) =>
      mockAddProjectFromFolder(...args),
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

jest.mock('../../../../src/renderer/components', () => ({
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

jest.mock('../../../../assets', () => ({ icons: {} }));

const PIPELINE_NOTE =
  'Pick the project to add a pipeline to, or create a new one.';
const OPEN_CREATE_PIPELINE = { state: { openCreatePipeline: true } };

const renderProjectList = (state: unknown) => {
  mockLocation = { pathname: '/app/select-project', state };
  return render(<SelectProject />);
};

describe('SelectProject pipeline mode', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSelectProject.mockReset().mockResolvedValue(undefined);
    mockAddProject.mockReset();
    mockAddProjectFromFolder.mockReset();
  });

  it('shows the pipeline note and opens the picked project with Create Pipeline', async () => {
    renderProjectList({ forPipeline: true, startNewProject: false });

    expect(screen.getByText(PIPELINE_NOTE)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('project-card-jaffle_shop'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/app/dbt-project',
        OPEN_CREATE_PIPELINE,
      ),
    );
    expect(mockSelectProject).toHaveBeenCalledWith({ projectId: '1' });
  });

  it('clears the navigation state so Back does not re-enter pipeline mode', () => {
    renderProjectList({ forPipeline: true, startNewProject: false });

    expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
      replace: true,
      state: {},
    });
  });

  it('opens the New Project form and opens the new project with Create Pipeline', async () => {
    mockAddProject.mockResolvedValue({ id: '9', name: 'pipeline_proj' });
    renderProjectList({ forPipeline: true, startNewProject: true });

    expect(screen.getByTestId('new-project-form')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Fill name'));
    fireEvent.click(screen.getByText('Create project'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/app/dbt-project',
        OPEN_CREATE_PIPELINE,
      ),
    );
    expect(mockSelectProject).toHaveBeenCalledWith({ projectId: '9' });
  });

  it('opens an imported project with Create Pipeline', async () => {
    mockAddProjectFromFolder.mockResolvedValue({ id: '5', name: 'imported' });
    renderProjectList({ forPipeline: true, startNewProject: false });

    fireEvent.click(screen.getByTestId('import-project-btn'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith(
        '/app/dbt-project',
        OPEN_CREATE_PIPELINE,
      ),
    );
    expect(mockSelectProject).toHaveBeenCalledWith({ projectId: '5' });
  });

  it('works as before when not opened from the Pipeline card', async () => {
    renderProjectList(null);

    expect(screen.queryByText(PIPELINE_NOTE)).toBeNull();
    expect(screen.queryByTestId('new-project-form')).toBeNull();

    fireEvent.click(screen.getByTestId('project-card-jaffle_shop'));

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/app/dbt-project', {
        state: undefined,
      }),
    );
    expect(mockNavigate).toHaveBeenCalledTimes(1);
  });
});
