import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import ProjectDetails from '../../../../src/renderer/screens/projectDetails';
import { registerCommand } from '../../../../src/renderer/components/commandPalette/commands';

const mockUseGetFileStatuses = jest.fn();
const mockSetIsSidebarOpen = jest.fn();
let mockRevealedFolderPath: string | null = null;

jest.mock('../../../../src/renderer/components', () => ({
  Loader: () => null,
  PanelHeaderDropdown: () => null,
  ProjectDbtSplitButton: () => null,
  TerminalLayout: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock(
  '../../../../src/renderer/components/sidebar/project-sidebar',
  () => ({
    ProjectSidebar: ({ activeTab }: { activeTab: string }) => (
      <div data-testid="open-panel">{activeTab}</div>
    ),
  }),
);

jest.mock('../../../../src/renderer/components/icon', () => ({
  Icon: () => null,
}));

jest.mock('../../../../src/renderer/components/editor/tabManager', () => ({
  TabManager: () => null,
}));

jest.mock('../../../../src/renderer/components/fileViews', () => ({
  ActiveFileView: () => null,
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetSelectedProject: () => ({
    data: { id: 'p1', name: 'Shop', path: '/projects/shop' },
    isLoading: false,
  }),
  useGitIsInitialized: () => ({ data: true }),
  useGetFileStatuses: () => mockUseGetFileStatuses(),
  useGetProjects: () => ({ data: [] }),
  useSelectProject: () => ({ mutateAsync: jest.fn() }),
}));

jest.mock('../../../../src/renderer/context/TabsProvider', () => ({
  useTabs: () => ({
    tabs: [],
    activeTab: undefined,
    revealedFolderPath: mockRevealedFolderPath,
  }),
}));

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({
    isChatOpen: false,
    setIsSidebarOpen: mockSetIsSidebarOpen,
  }),
}));

jest.mock('../../../../src/renderer/layouts', () => ({
  AppLayout: ({
    sidebarContent,
    children,
  }: {
    sidebarContent: React.ReactNode;
    children: React.ReactNode;
  }) => (
    <>
      {sidebarContent}
      {children}
    </>
  ),
}));

jest.mock('../../../../src/renderer/screens/chat', () => ({
  __esModule: true,
  default: () => null,
}));

const renderProjectDetails = (navigationState?: unknown) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter
        initialEntries={[{ pathname: '/', state: navigationState }]}
      >
        <ProjectDetails />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('ProjectDetails side panel tabs', () => {
  beforeEach(() => {
    mockUseGetFileStatuses.mockReturnValue({ data: [] });
    mockSetIsSidebarOpen.mockClear();
    mockRevealedFolderPath = null;
  });

  it('goes to the Explorer tab and opens the panel when a folder is to be shown', () => {
    const view = renderProjectDetails();
    fireEvent.click(screen.getByRole('tab', { name: 'Git' }));
    expect(screen.getByTestId('open-panel')).toHaveTextContent('scm');

    mockRevealedFolderPath = '/projects/shop/models';
    view.rerender(
      <ThemeProvider theme={createTheme()}>
        <MemoryRouter>
          <ProjectDetails />
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('open-panel')).toHaveTextContent('explorer');
    expect(mockSetIsSidebarOpen).toHaveBeenCalledWith(true);
  });

  it('has Explorer, Git and Database tabs and no Search tab', () => {
    renderProjectDetails();

    expect(
      screen.getAllByRole('tab').map((tab) => tab.getAttribute('aria-label')),
    ).toEqual(['Explorer', 'Git', 'Database']);
  });

  // jsdom has no layout, so this checks MUI's full-width class, not pixels
  it.each(['Explorer', 'Git', 'Database'])(
    'stretches the %s tab to share the full width of the panel',
    (tabName) => {
      renderProjectDetails();

      expect(screen.getByRole('tab', { name: tabName })).toHaveClass(
        'MuiTab-fullWidth',
      );
    },
  );

  it.each(['Explorer', 'Git', 'Database'])(
    'shows no label text on the %s tab',
    (tabName) => {
      renderProjectDetails();

      const tab = screen.getByRole('tab', { name: tabName });

      expect(tab).not.toHaveTextContent(tabName);
    },
  );

  it.each(['Explorer', 'Git', 'Database'])(
    'shows the name of the %s tab on hover',
    async (tabName) => {
      renderProjectDetails();

      fireEvent.mouseOver(screen.getByRole('tab', { name: tabName }));

      expect(await screen.findByRole('tooltip')).toHaveTextContent(tabName);
    },
  );

  it.each(['Explorer', 'Git', 'Database'])(
    'shows the name of the %s tab when reached with the keyboard',
    async (tabName) => {
      renderProjectDetails();

      const tab = screen.getByRole('tab', { name: tabName });
      fireEvent.keyDown(document.body, { key: 'Tab' });
      act(() => tab.focus());

      expect(await screen.findByRole('tooltip')).toHaveTextContent(tabName);
    },
  );

  it('moves between tabs with the left and right arrow keys', () => {
    renderProjectDetails();
    const explorerTab = screen.getByRole('tab', { name: 'Explorer' });
    act(() => explorerTab.focus());

    fireEvent.keyDown(explorerTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Git' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Database' })).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Git' })).toHaveFocus();
  });

  it('shows the number of uncommitted files on the Git tab', () => {
    mockUseGetFileStatuses.mockReturnValue({
      data: [{ path: 'a.sql' }, { path: 'b.sql' }, { path: 'c.sql' }],
    });
    renderProjectDetails();

    const gitTab = screen.getByRole('tab', { name: 'Git' });

    expect(gitTab).toHaveTextContent('3');
    expect(gitTab.querySelector('.MuiBadge-invisible')).toBeNull();
  });

  it('hides the number on the Git tab when nothing is uncommitted', () => {
    renderProjectDetails();

    const gitTab = screen.getByRole('tab', { name: 'Git' });

    expect(gitTab.querySelector('.MuiBadge-invisible')).not.toBeNull();
  });

  it('opens the panel of the clicked tab', () => {
    renderProjectDetails();

    expect(screen.getByTestId('open-panel')).toHaveTextContent('explorer');

    fireEvent.click(screen.getByRole('tab', { name: 'Git' }));
    expect(screen.getByTestId('open-panel')).toHaveTextContent('scm');

    fireEvent.click(screen.getByRole('tab', { name: 'Database' }));
    expect(screen.getByTestId('open-panel')).toHaveTextContent('connections');
  });

  it('has only tabs in the tab row, because refresh lives in the file tree', () => {
    renderProjectDetails();

    expect(
      screen.queryByRole('button', { name: 'Refresh directories' }),
    ).not.toBeInTheDocument();
  });
});

describe('ProjectDetails opened with a command to run', () => {
  beforeEach(() => {
    mockUseGetFileStatuses.mockReturnValue({ data: [] });
  });

  it('runs the command the project list handed over, once the screen is open', () => {
    const run = jest.fn();
    const unregister = registerCommand({
      id: 'test.after-open',
      label: 'Test',
      hidden: true,
      run,
    });

    renderProjectDetails({ runCommand: 'test.after-open' });

    expect(run).toHaveBeenCalledTimes(1);
    unregister();
  });

  it('runs nothing when opened the usual way', () => {
    const run = jest.fn();
    const unregister = registerCommand({
      id: 'test.after-open',
      label: 'Test',
      hidden: true,
      run,
    });

    renderProjectDetails();

    expect(run).not.toHaveBeenCalled();
    unregister();
  });
});
