import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';

import SelectProject from '../../../../src/renderer/screens/selectProject';
import {
  useGetProjectGitSummary,
  useGetProjects,
} from '../../../../src/renderer/controllers';

const VIEW_STORAGE_KEY = 'selectProject.view';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
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
    useGetProjects: jest.fn(),
    useGetProjectGitSummary: jest.fn(),
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
  NewProject: () => null,
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

const projects = [
  {
    id: '1',
    name: 'alpha_project',
    path: '/projects/alpha_project',
    createdAt: '2026-11-03T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'beta_project',
    path: '/projects/beta_project',
    createdAt: '2026-11-05T10:00:00.000Z',
  },
];

const getStickyAncestor = (element: HTMLElement) => {
  let current: HTMLElement | null = element;
  while (current && getComputedStyle(current).position !== 'sticky') {
    current = current.parentElement;
  }
  return current;
};

describe('Manage Projects screen', () => {
  beforeEach(() => {
    localStorage.clear();
    (useGetProjects as jest.Mock).mockReturnValue({ data: projects });
    (useGetProjectGitSummary as jest.Mock).mockReturnValue({
      data: null,
      isLoading: false,
    });
  });

  describe('card and list views', () => {
    it('starts in list view when nothing is saved', () => {
      render(<SelectProject />);

      expect(screen.getByTestId('project-list')).toHaveStyle({
        display: 'flex',
      });
      expect(screen.getByRole('button', { name: 'list view' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    });

    it('switches to card view and remembers the choice', () => {
      render(<SelectProject />);

      fireEvent.click(screen.getByRole('button', { name: 'card view' }));

      expect(screen.getByTestId('project-list')).toHaveStyle({
        display: 'grid',
      });
      expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('card');
    });

    it('starts in card view when that was the saved choice', () => {
      localStorage.setItem(VIEW_STORAGE_KEY, 'card');

      render(<SelectProject />);

      expect(screen.getByTestId('project-list')).toHaveStyle({
        display: 'grid',
      });
    });

    it('switches back to list view and remembers the choice', () => {
      localStorage.setItem(VIEW_STORAGE_KEY, 'card');
      render(<SelectProject />);

      fireEvent.click(screen.getByRole('button', { name: 'list view' }));

      expect(screen.getByTestId('project-list')).toHaveStyle({
        display: 'flex',
      });
      expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBe('list');
    });

    it('stays in the current view when the active button is clicked again', () => {
      render(<SelectProject />);

      fireEvent.click(screen.getByRole('button', { name: 'list view' }));

      expect(screen.getByTestId('project-list')).toHaveStyle({
        display: 'flex',
      });
      expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
    });

    it.each(['list', 'card'])('shows every project in %s view', (view) => {
      localStorage.setItem(VIEW_STORAGE_KEY, view);

      render(<SelectProject />);

      expect(
        screen.getByTestId('project-card-alpha_project'),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('project-card-beta_project'),
      ).toBeInTheDocument();
    });
  });

  describe('project details', () => {
    it.each(['list', 'card'])(
      'shows the path, Git details and dates in %s view',
      (view) => {
        localStorage.setItem(VIEW_STORAGE_KEY, view);

        render(<SelectProject />);

        const card = within(screen.getByTestId('project-card-alpha_project'));

        expect(card.getByText('/projects/alpha_project')).toBeInTheDocument();
        expect(card.getByText('Not a Git repository')).toBeInTheDocument();
        expect(card.getByText(/^Added Nov \d, 2026$/)).toBeInTheDocument();
      },
    );

    it('asks for each project’s own Git details', () => {
      render(<SelectProject />);

      expect(useGetProjectGitSummary).toHaveBeenCalledWith(
        '/projects/alpha_project',
      );
      expect(useGetProjectGitSummary).toHaveBeenCalledWith(
        '/projects/beta_project',
      );
    });

    it('includes the last active time once a project has been opened', () => {
      (useGetProjects as jest.Mock).mockReturnValue({
        data: [{ ...projects[0], lastOpenedAt: Date.now() }],
      });

      render(<SelectProject />);

      expect(
        screen.getByText(/^Added Nov \d, 2026 · Last active /),
      ).toBeInTheDocument();
    });
  });

  describe('header', () => {
    it('places the view toggle right after the New button', () => {
      render(<SelectProject />);

      const newButton = screen.getByTestId('create-project-btn');
      const viewToggle = screen.getByRole('group', { name: 'view toggle' });

      expect(newButton.parentElement).toBe(viewToggle.parentElement);
      expect(newButton.compareDocumentPosition(viewToggle)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it('keeps the title, search, buttons and toggle pinned together', () => {
      render(<SelectProject />);

      const stickyHeader = getStickyAncestor(
        screen.getByText('Manage your projects'),
      );

      expect(stickyHeader).not.toBeNull();
      expect(stickyHeader).toHaveStyle({ top: '0px' });
      const header = within(stickyHeader as HTMLElement);
      expect(header.getByTestId('project-search-input')).toBeInTheDocument();
      expect(header.getByTestId('create-project-btn')).toBeInTheDocument();
      expect(
        header.getByRole('group', { name: 'view toggle' }),
      ).toBeInTheDocument();
    });

    it('lets the project list scroll under the pinned header', () => {
      render(<SelectProject />);

      expect(getStickyAncestor(screen.getByTestId('project-list'))).toBeNull();
    });
  });
});
