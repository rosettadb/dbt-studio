import React from 'react';
import { render, screen } from '@testing-library/react';

import SelectProject from '../../../../src/renderer/screens/selectProject';

const mockNavigate = jest.fn();
const mockUseLocation = jest.fn();

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useLocation: () => mockUseLocation(),
}));

jest.mock('../../../../src/renderer/controllers', () => {
  const mutation = () => ({ mutate: jest.fn(), mutateAsync: jest.fn() });
  return {
    useDeleteProject: mutation,
    useRemoveProjectFromList: mutation,
    useFilePicker: mutation,
    useSelectProject: mutation,
    useUpdateProject: mutation,
    useGetConnections: () => ({ data: [], isLoading: false }),
    useDuckLakeInstances: () => ({ data: [], isLoading: false }),
    useGetSettings: () => ({ data: { projectsDirectory: '/projects' } }),
    useGetProjects: () => ({
      data: [{ id: '1', name: 'alpha_project', path: '/projects/alpha' }],
    }),
    useGetProjectGitSummary: () => ({ data: undefined, isLoading: false }),
  };
});

jest.mock('../../../../src/renderer/services', () => ({
  projectsServices: {},
  connectorsServices: {},
}));

jest.mock('../../../../src/renderer/components', () => ({
  AddConnectionModal: () => null,
  CloneRepoModal: () => null,
  GetStartedModal: () => null,
  NewProject: () => 'new project form',
  Icon: () => null,
}));

jest.mock('../../../../src/renderer/layouts', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: () => undefined,
}));

jest.mock('../../../../assets', () => ({
  icons: {},
}));

// The Dashboard New Project button arrives with only startNewProject (no
// pipeline mode). The form opens, and the request is cleared from history so
// going Back doesn't reopen it.
describe('Projects page new project form on arrival', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the form and clears the request when asked to', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/app/select-project',
      state: { startNewProject: true },
    });

    render(<SelectProject />);

    expect(screen.getByText('new project form')).toBeInTheDocument();
    expect(screen.queryByText('alpha_project')).not.toBeInTheDocument();
    expect(mockNavigate).toHaveBeenCalledWith('/app/select-project', {
      replace: true,
      state: {},
    });
  });

  it('shows the project list on a normal visit', () => {
    mockUseLocation.mockReturnValue({
      pathname: '/app/select-project',
      state: null,
    });

    render(<SelectProject />);

    expect(screen.getByText('alpha_project')).toBeInTheDocument();
    expect(screen.queryByText('new project form')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
