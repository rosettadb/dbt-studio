import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';

import Dashboard from '../../../../src/renderer/screens/dashboard';
import {
  useApiKey,
  useGetConnections,
  useGetProjects,
  useProfile,
} from '../../../../src/renderer/controllers';

const mockNavigate = jest.fn();

// The Dashboard watches its size to fit the window; jsdom has no
// ResizeObserver, so this one lets a test say which box was resized: the
// window, or only the page.
let reportResizedBoxes: (
  resizedBoxes: { target: Element }[],
) => void = () => {};
const observeBox = jest.fn();
window.ResizeObserver = jest.fn((callback) => {
  reportResizedBoxes = callback;
  return { observe: observeBox, disconnect: jest.fn() };
}) as unknown as typeof ResizeObserver;

// The window box is the one watched by its outer (border) size
const windowBox = () =>
  observeBox.mock.calls.find(
    ([, options]) => options?.box === 'border-box',
  )![0];
const resizeWindow = () =>
  act(() => reportResizedBoxes([{ target: windowBox() }]));
const pageChangedSize = () =>
  act(() =>
    reportResizedBoxes([
      {
        target: screen
          .getByText('Workspace Overview')
          .closest('[data-tour="tour-workspace-overview"]')!.parentElement!,
      },
    ]),
  );

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

jest.mock(
  '../../../../src/extensions/pipeline/renderer/assets/route.svg',
  () => ({
    ReactComponent: () => null,
  }),
);

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

// A value from the element's own style rule; jsdom lays nothing out, so the
// rule is what can be checked
const styleRuleValue = (element: Element, property: string) => {
  const selectors = Array.from(element.classList).map((name) => `.${name}`);
  const value = Array.from(document.styleSheets)
    .flatMap((sheet) => Array.from(sheet.cssRules))
    .filter(
      (rule) =>
        rule instanceof CSSStyleRule && selectors.includes(rule.selectorText),
    )
    .map((rule) =>
      rule.cssText.match(new RegExp(`(?:^|[ ;{])${property}: ([^;]+);`)),
    )
    .find(Boolean);
  return value ? value[1] : undefined;
};

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

      const connectionsPanel = screen
        .getByText(/Configured Connections/)
        .closest('[data-tour="tour-configured-connections"]') as HTMLElement;
      expect(
        within(connectionsPanel)
          .getAllByText(/^connection_\d$/)
          .map((name) => name.textContent),
      ).toEqual(['connection_1', 'connection_2', 'connection_3']);
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

  describe('fitting the window', () => {
    // jsdom lays nothing out, so every element reports these sizes: the
    // window's height and width, and the page's height.
    const sizeSpies: jest.SpyInstance[] = [];
    const setSizes = (sizes: {
      windowHeight: number;
      windowWidth: number;
      pageHeight: number;
    }) => {
      sizeSpies.forEach((spy) => spy.mockRestore());
      sizeSpies.splice(0);
      sizeSpies.push(
        jest
          .spyOn(Element.prototype, 'clientHeight', 'get')
          .mockReturnValue(sizes.windowHeight),
        jest
          .spyOn(Element.prototype, 'clientWidth', 'get')
          .mockReturnValue(sizes.windowWidth),
        jest
          .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
          .mockReturnValue(sizes.pageHeight),
      );
    };

    afterEach(() => {
      sizeSpies.forEach((spy) => spy.mockRestore());
      sizeSpies.splice(0);
    });

    // The page: the box around the header, modules and panels
    const page = () =>
      screen
        .getByText('Workspace Overview')
        .closest('[data-tour="tour-workspace-overview"]')!.parentElement!;

    // The scale in the page's style rule; no transform means unscaled
    const pageScale = () => {
      const transform = styleRuleValue(page(), 'transform');
      return transform ? Number(transform.match(/scale\(([\d.]+)\)/)![1]) : 1;
    };

    const moduleCard = () =>
      screen.getByText('Notebook').closest('.MuiGrid-item') as HTMLElement;

    it('shrinks the page to fit a short window', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard();

      expect(pageScale()).toBe(0.75);
    });

    it('grows the page to fill a tall window', () => {
      setSizes({ windowHeight: 1200, windowWidth: 3000, pageHeight: 800 });

      renderDashboard();

      expect(pageScale()).toBe(1.5);
    });

    it('stops shrinking at 70% so the text stays readable', () => {
      setSizes({ windowHeight: 300, windowWidth: 2000, pageHeight: 800 });

      renderDashboard();

      expect(pageScale()).toBe(0.7);
    });

    it('shrinks a narrow window enough to keep 4 cards per row', () => {
      // 920 / 1150 (the width 4 cards need) = 0.8, below the height's 1.5
      setSizes({ windowHeight: 1200, windowWidth: 920, pageHeight: 800 });

      renderDashboard();

      expect(pageScale()).toBe(0.8);
    });

    it('refits when the window is resized', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });
      renderDashboard();

      setSizes({ windowHeight: 1000, windowWidth: 2000, pageHeight: 800 });
      resizeWindow();

      expect(pageScale()).toBe(1.25);
    });

    it('skips a tiny grow so it settles, but always applies a shrink', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });
      renderDashboard();

      // Wants 0.752 (0.7528 rounded down): less than 0.005 bigger, so it
      // stays put
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 797 });
      resizeWindow();
      expect(pageScale()).toBe(0.75);

      // Wants 0.7317, rounded down: any shrink applies
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 820 });
      resizeWindow();
      expect(pageScale()).toBe(0.731);
    });

    it('only shrinks when the page itself changes size, so it cannot flicker', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });
      renderDashboard();

      // Text unwrapped and the page got shorter: growing could rewrap it and
      // loop, so it stays put
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 700 });
      pageChangedSize();
      expect(pageScale()).toBe(0.75);

      // Text wrapped and the page got taller: it still shrinks to fit
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 820 });
      pageChangedSize();
      expect(pageScale()).toBe(0.731);
    });

    it("watches the window's outer size, so a scrollbar appearing is not a resize", () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard();

      expect(windowBox()).toBeInstanceOf(HTMLElement);
      expect(observeBox).toHaveBeenCalledWith(windowBox(), {
        box: 'border-box',
      });
    });

    it('keeps room for 3 rows and the Manage All button with only 1 project, so the size stays the same', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard({ projects: buildProjects(1) });

      const projectRows = screen
        .getByText('Recent Projects (1)')
        .closest('[data-tour="tour-recent-projects"]')!
        .querySelector('.MuiList-root')!.parentElement!;
      expect(styleRuleValue(projectRows, 'min-height')).toBe('132px');
      expect(styleRuleValue(projectRows.nextElementSibling!, 'height')).toBe(
        '48px',
      );
    });

    it('lays the page out wider and sizes the box around it to the scaled height, so it fills the window without scrolling', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard();

      expect(pageScale()).toBe(0.75);
      // 100% / 0.75, so once scaled it is exactly as wide as the window
      expect(styleRuleValue(page(), 'width')).toMatch(/^133\.33+\d*%$/);
      expect(styleRuleValue(page(), 'transform-origin')).toBe('top left');
      // 800px tall laid out, 600px once scaled
      expect(styleRuleValue(page().parentElement!, 'height')).toBe('600px');
      expect(styleRuleValue(page().parentElement!, 'overflow')).toBe('hidden');
    });

    it('keeps 4 cards per row and the panels side by side', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard();

      expect(moduleCard()).toHaveClass('MuiGrid-grid-xs-3');
      expect(moduleCard()).not.toHaveClass('MuiGrid-grid-sm-6');
      expect(
        screen.getByText(/Recent Projects/).closest('.MuiGrid-item'),
      ).toHaveClass('MuiGrid-grid-xs-6');
    });

    it('stays unscaled and stacks on a narrow window with no projects, for the quick start tour', () => {
      setSizes({ windowHeight: 600, windowWidth: 2000, pageHeight: 800 });

      renderDashboard({ projects: [] });

      expect(pageScale()).toBe(1);
      expect(moduleCard()).toHaveClass('MuiGrid-grid-xs-12');
      expect(moduleCard()).toHaveClass('MuiGrid-grid-sm-6');
    });
  });
});
