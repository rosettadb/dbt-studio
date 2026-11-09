import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import ProjectDetails from '../../../../src/renderer/screens/projectDetails';

const mockUseGetFileStatuses = jest.fn();
const mockUseGetProjectFiles = jest.fn();
const mockRefreshProjectFiles = jest.fn();
const mockSetIsSidebarOpen = jest.fn();
let mockRevealedFolderPath: string | null = null;

jest.mock('../../../../src/renderer/components', () => ({
  Loader: () => null,
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
  useGetProjectFiles: () => mockUseGetProjectFiles(),
}));

jest.mock('../../../../src/renderer/hooks/useRefreshProjectFiles', () => ({
  useRefreshProjectFiles: () => mockRefreshProjectFiles,
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

const renderProjectDetails = () =>
  render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <ProjectDetails />
      </MemoryRouter>
    </ThemeProvider>,
  );

describe('ProjectDetails side panel tabs', () => {
  beforeEach(() => {
    mockUseGetFileStatuses.mockReturnValue({ data: [] });
    mockUseGetProjectFiles.mockReturnValue({ isLoading: false });
    mockRefreshProjectFiles.mockClear();
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

  it('refreshes the project files from the refresh button on the Explorer tab', () => {
    renderProjectDetails();

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh directories' }),
    );

    expect(mockRefreshProjectFiles).toHaveBeenCalledTimes(1);
  });

  it.each(['Git', 'Database'])(
    'hides the refresh button on the %s tab',
    (tabName) => {
      renderProjectDetails();

      fireEvent.click(screen.getByRole('tab', { name: tabName }));

      expect(
        screen.queryByLabelText('Refresh directories'),
      ).not.toBeInTheDocument();
    },
  );

  it('shows a spinner in place of the refresh button while the files load', () => {
    mockUseGetProjectFiles.mockReturnValue({ isLoading: true });
    renderProjectDetails();

    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
