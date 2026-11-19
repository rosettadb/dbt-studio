import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

import SelectProject from '../../../../src/renderer/screens/selectProject';
import {
  useGetProjectGitSummary,
  useGetProjects,
} from '../../../../src/renderer/controllers';
import { projectsServices } from '../../../../src/renderer/services';

const VIEW_STORAGE_KEY = 'selectProject.view';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useLocation: () => ({ pathname: '/app/select-project', state: null }),
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
  projectsServices: { addProjectFromFolder: jest.fn() },
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

// Only DuckDB has a logo here, so a Postgres chip falls back to the cylinder
jest.mock('../../../../src/connections/registry.renderer', () => ({
  connectionIcon: (type?: string) =>
    type === 'duckdb' ? 'duckdb-logo.svg' : undefined,
}));

jest.mock('../../../../assets', () => ({
  icons: {},
}));

jest.mock(
  '../../../../src/renderer/components/icon/DatabaseCylinderIcon',
  () => {
    const { createElement } = jest.requireActual('react');
    return {
      DatabaseCylinderIcon: () =>
        createElement('span', { 'data-testid': 'database-cylinder-icon' }),
    };
  },
);

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

    describe('when browser storage fails', () => {
      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('still shows the screen in list view when the saved view cannot be read', () => {
        jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
          throw new Error('storage blocked');
        });

        render(<SelectProject />);

        expect(screen.getByTestId('project-list')).toHaveStyle({
          display: 'flex',
        });
      });

      it('still switches view when the choice cannot be saved', () => {
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
          throw new Error('quota exceeded');
        });
        render(<SelectProject />);

        fireEvent.click(screen.getByRole('button', { name: 'card view' }));

        expect(screen.getByTestId('project-list')).toHaveStyle({
          display: 'grid',
        });
      });
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

  describe('connection icons', () => {
    const connectedProject = {
      ...projects[0],
      connection: { type: 'postgres', name: 'Local-Postgres' },
    };

    it.each(['list', 'card'])(
      'shows the connection’s own logo on its chip in %s view',
      (view) => {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
        (useGetProjects as jest.Mock).mockReturnValue({
          data: [
            {
              ...projects[0],
              connection: { type: 'duckdb', name: 'jaffle_shop_duckdb' },
            },
          ],
        });

        render(<SelectProject />);

        const chip = screen.getByTitle('Connection Name');
        expect(chip).toHaveTextContent('jaffle_shop_duckdb');
        expect(
          within(chip).getByTestId('connection-chip-logo'),
        ).toHaveAttribute('src', 'duckdb-logo.svg');
        expect(
          within(chip).queryByTestId('database-cylinder-icon'),
        ).not.toBeInTheDocument();
      },
    );

    it.each(['list', 'card'])(
      'shows the database cylinder on a chip whose connection has no logo in %s view',
      (view) => {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
        (useGetProjects as jest.Mock).mockReturnValue({
          data: [connectedProject],
        });

        render(<SelectProject />);

        const chip = screen.getByTitle('Connection Name');
        expect(chip).toHaveTextContent('Local-Postgres');
        expect(
          within(chip).getByTestId('database-cylinder-icon'),
        ).toBeInTheDocument();
        expect(within(chip).queryByTestId('CableIcon')).not.toBeInTheDocument();
      },
    );

    it.each(['list', 'card'])(
      'shows the database cylinder on the No connection chip in %s view',
      (view) => {
        localStorage.setItem(VIEW_STORAGE_KEY, view);

        render(<SelectProject />);

        const chip = within(
          screen.getByTestId('project-card-alpha_project'),
        ).getByTitle('Click to add database connection');
        expect(chip).toHaveTextContent('No connection');
        expect(
          within(chip).getByTestId('database-cylinder-icon'),
        ).toBeInTheDocument();
      },
    );

    it.each(['list', 'card'])(
      'starts the title with the project type icon, with no type chip, in %s view',
      (view) => {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
        (useGetProjects as jest.Mock).mockReturnValue({
          data: [connectedProject],
        });

        render(<SelectProject />);

        const card = screen.getByTestId('project-card-alpha_project');
        expect(
          within(card).getByTestId('project-type-icon-alpha_project'),
        ).toBeInTheDocument();
        expect(
          within(card).queryByTestId('StorageIcon'),
        ).not.toBeInTheDocument();
        expect(within(card).queryByText('dbt Project')).not.toBeInTheDocument();
        // The only database icon left is the connection chip's
        expect(
          within(card).getAllByTestId('database-cylinder-icon'),
        ).toHaveLength(1);
      },
    );
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

  // Plan 95a, D2: the app's own dialog, not a native one
  describe('import without dbt_project.yml', () => {
    it('imports the folder straight away, with no dialog', async () => {
      const importFolder = projectsServices.addProjectFromFolder as jest.Mock;
      importFolder.mockReset();
      importFolder.mockResolvedValueOnce({ id: '9', name: 'molini_shoes' });
      render(<SelectProject />);

      fireEvent.click(screen.getByTestId('import-project-btn'));

      await waitFor(() => expect(importFolder).toHaveBeenCalledTimes(1));
      expect(importFolder).toHaveBeenCalledWith();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
