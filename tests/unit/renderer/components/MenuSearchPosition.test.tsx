import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material';
import { Menu } from '../../../../src/renderer/components/menu';

const mockUseApiKey = jest.fn();

jest.mock('../../../../src/renderer/components/commandPalette', () => ({
  CommandPalette: () => <button type="button">Global search</button>,
}));

jest.mock('../../../../src/renderer/components/icon', () => ({
  Icon: () => null,
}));

jest.mock('../../../../src/renderer/hooks', () => ({
  useAppContext: () => ({
    isChatOpen: false,
    setIsChatOpen: jest.fn(),
    isSidebarOpen: true,
    setIsSidebarOpen: jest.fn(),
  }),
}));

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetProjects: () => ({ data: [] }),
  useGetSelectedProject: () => ({
    data: { id: 'p1', name: 'Shop', path: '/projects/shop' },
  }),
  useSelectProject: () => ({ mutateAsync: jest.fn() }),
  useProfile: () => ({ data: undefined }),
  useProfileSubscription: jest.fn(),
  useApiKey: () => mockUseApiKey(),
  useAuthLogin: () => ({ mutate: jest.fn(), isLoading: false }),
  useAuthLogout: () => ({ isLoading: false }),
  useAuthSubscription: jest.fn(),
  useGetSettings: () => ({ data: {} }),
  useUpdateSettings: () => ({ mutate: jest.fn() }),
}));

const renderMenuAt = (pathname: string) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter initialEntries={[pathname]}>
        <Menu actions={<button type="button">Run dbt</button>} />
      </MemoryRouter>
    </ThemeProvider>,
  );

const isBefore = (first: HTMLElement, second: HTMLElement) =>
  // eslint-disable-next-line no-bitwise
  (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !==
  0;

describe('Menu global search position', () => {
  beforeEach(() => {
    mockUseApiKey.mockReturnValue({ data: undefined, isLoading: false });
  });

  it('sits before Connect to Cloud and the AI button', () => {
    renderMenuAt('/app/dbt-project');

    const search = screen.getByRole('button', { name: 'Global search' });
    const cloud = screen.getByText('Connect to Cloud');
    const aiAssistant = screen.getByRole('button', {
      name: 'AI Assistant (beta)',
    });

    expect(isBefore(search, cloud)).toBe(true);
    expect(isBefore(cloud, aiAssistant)).toBe(true);
  });

  it('sits before the project page actions', () => {
    renderMenuAt('/app/dbt-project');

    expect(
      isBefore(
        screen.getByRole('button', { name: 'Global search' }),
        screen.getByRole('button', { name: 'Run dbt' }),
      ),
    ).toBe(true);
  });

  it('stays there when signed in to the cloud', () => {
    mockUseApiKey.mockReturnValue({ data: 'key', isLoading: false });
    renderMenuAt('/app/dbt-project');

    expect(
      isBefore(
        screen.getByRole('button', { name: 'Global search' }),
        screen.getByRole('button', { name: /Cloud Dashboard/ }),
      ),
    ).toBe(true);
  });

  it.each(['/app', '/app/sql', '/app/settings', '/app/select-project'])(
    'shows on %s',
    (pathname) => {
      renderMenuAt(pathname);

      expect(
        screen.getByRole('button', { name: 'Global search' }),
      ).toBeInTheDocument();
    },
  );
});
