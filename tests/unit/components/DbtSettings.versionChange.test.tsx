import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { toast } from 'react-toastify';
import { DbtSettings } from '../../../src/renderer/components/settings/DbtSettings';
import type { TaskRecord } from '../../../src/types/ipc';

// Each test renders the whole dbt settings page, which can take several
// seconds in a busy full test run.
jest.setTimeout(30000);

const listVersions = jest.fn();
const planVersionChange = jest.fn();
const installVersionChange = jest.fn();
const installPackageVersion = jest.fn();
const installLatestPackage = jest.fn();
const getInstalledPackages = jest.fn();
const listPackageVersions = jest.fn();
const getActiveAdapterCapabilities = jest.fn();
const installPython = jest.fn();

// DbtSettings -> modals -> editor pulls in the ESM-only markdown stack.
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock('remark-gfm', () => jest.fn());
jest.mock('rehype-raw', () => jest.fn());
jest.mock('rehype-highlight', () => jest.fn());
jest.mock('rehype-sanitize', () => jest.fn());

jest.mock('../../../src/renderer/controllers', () => ({
  useListDbtCoreVersions: () => listVersions,
  useGetInstalledDbtCore: () => jest.fn(),
  useGetInstalledPackages: () => getInstalledPackages,
  useInstallPackageVersion: () => installPackageVersion,
  useInstallLatestPackage: () => installLatestPackage,
  useUninstallPackage: () => jest.fn(),
  useListPackageVersions: () => listPackageVersions,
  usePlanDbtVersionChange: () => planVersionChange,
  useInstallDbtVersionChange: () => installVersionChange,
  useCheckCurrentProjectCompatibility: () => jest.fn(),
  useGetActiveAdapterCapabilities: () => getActiveAdapterCapabilities,
  useInstallPython: () => ({ mutateAsync: installPython }),
}));

// Installs report their state through the task manager, which is not mounted
// here; each test sets the queued or running tasks it needs.
let mockTasks: TaskRecord[] = [];
const mockCancelTask = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../src/renderer/context/TaskManagerProvider', () => ({
  ...jest.requireActual('../../../src/renderer/context/TaskManagerProvider'),
  useTaskManager: () => ({
    tasks: mockTasks,
    cancel: mockCancelTask,
    remove: jest.fn(),
    subscribe: jest.fn(),
    getTask: jest.fn(),
  }),
}));

// Queued and running chips open the Task Manager when clicked.
const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const dbtTask = (
  subject: string,
  status: TaskRecord['status'] = 'pending',
  // When the task joined the queue; earlier ones run first.
  startedAt = Date.now(),
): TaskRecord => ({
  id: `task-${subject}`,
  type: 'install:dbt',
  label: `Installing ${subject}`,
  status,
  startedAt,
  cancellable: status === 'pending',
  subject,
});

const stableItem = {
  version: '1.11.12',
  isPrerelease: false,
  isLatestStable: true,
  isInstalled: true,
  channel: 'stable' as const,
};

const pythonPreviewItem = {
  version: '1.12.0rc2',
  isPrerelease: true,
  isLatestStable: false,
  isInstalled: false,
  channel: 'preview' as const,
};

// dbt 2.x is listed from the dbt-oss package as stable releases.
const v2Items = ['2.0.5', '2.0.4'].map((version, index) => ({
  version,
  isPrerelease: false,
  isLatestStable: index === 0,
  isInstalled: false,
  channel: 'stable' as const,
}));

const olderStableItem = (version: string) => ({
  version,
  isPrerelease: false,
  isLatestStable: false,
  isInstalled: false,
  channel: 'stable' as const,
});

const previousStableItems = ['1.11.11', '1.11.10', '1.11.9', '1.11.8'].map(
  olderStableItem,
);

const mockVersionList = (stableItems: (typeof stableItem)[]) =>
  listVersions.mockImplementation(
    async ({ includePrerelease }: { includePrerelease?: boolean }) => ({
      versions: includePrerelease
        ? [...v2Items, pythonPreviewItem, ...stableItems]
        : stableItems,
      latestStable: '1.11.12',
      currentVersion: '1.11.12',
    }),
  );

describe('DbtSettings runtime switch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTasks = [];
    getInstalledPackages.mockResolvedValue({ packages: {} });
    installPython.mockResolvedValue({
      success: true,
      path: '/managed/venv/bin/python3',
      version: '3.12.0',
    });
    installPackageVersion.mockResolvedValue({
      ok: true,
      installedVersion: '1.11.12',
      dbtPath: '/managed/venv/bin/dbt',
    });
    installLatestPackage.mockResolvedValue({ ok: true });
    getActiveAdapterCapabilities.mockResolvedValue({
      dbtCoreVersion: '1.11.12',
      runtime: 'v1',
      packageProvenance: 'apache-dbt-core',
      adapters: [],
    });
    mockVersionList([stableItem, ...previousStableItems]);
    planVersionChange.mockResolvedValue({
      currentVersion: '1.11.12',
      targetVersion: '2.0.5',
      direction: 'upgrade',
      channel: 'stable',
      isMajorVersionChange: true,
      globalImpactWarning:
        'This changes the global dbt-core version used by all local projects.',
      warnings: ['This is a major dbt-core version change.'],
      adapters: [],
      rollbackVersion: '1.11.12',
    });
  });

  // dbtPath 'dbt' is how the page represents "dbt is not installed".
  const renderSettings = ({
    dbtPath = '/managed/venv/bin/dbt',
    dbtVersion = '1.11.12',
    pythonPath = '/managed/venv/bin/python3',
  } = {}) =>
    render(
      <DbtSettings
        settings={
          {
            dbtPath,
            dbtVersion,
            pythonPath,
            pythonVersion: '3.12.0',
          } as any
        }
        onInstallDbtSave={jest.fn()}
      />,
    );

  const runtimeToggle = (runtime: 'v1' | 'v2') =>
    screen.getByRole('button', { name: `Show dbt ${runtime} versions` });

  // Opens the version dropdown of a runtime that is not installed.
  const openVersionDropdown = async (runtime: 'v1' | 'v2') => {
    fireEvent.click(runtimeToggle(runtime));
    fireEvent.click(
      await screen.findByRole('button', { name: `Activate ${runtime}` }),
    );
    return screen.getByRole('combobox', {
      name: `dbt ${runtime} version to install`,
    });
  };

  // The page has other Install buttons (adapters), so look in the Runtime row.
  const runtimeInstallButton = () =>
    within(screen.getByRole('group', { name: 'Runtime' })).getByRole('button', {
      name: 'Install',
    });

  // Activates v2 and installs the dropdown's default (latest stable 2.0.5).
  const clickNewestV2Version = async () => {
    await openVersionDropdown('v2');
    fireEvent.click(runtimeInstallButton());
  };

  const openV2InstallDialog = async () => {
    await clickNewestV2Version();
    await screen.findByText('Switch to dbt Core v2?');
  };

  it('shows the installed version in the header and starts on that runtime', async () => {
    renderSettings();

    expect(
      await screen.findByText('v1 · 1.11.12 installed'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Active ·/)).not.toBeInTheDocument();
    expect(runtimeToggle('v1')).toHaveAttribute('aria-pressed', 'true');
    expect(runtimeToggle('v2')).toHaveAttribute('aria-pressed', 'false');
    expect(listVersions).toHaveBeenCalledWith({
      includePrerelease: true,
      limit: 100,
    });
  });

  it('shows Activate v2 instead of the v2 list when dbt v2 is clicked', async () => {
    renderSettings();
    await screen.findByText('v1 · 1.11.12 installed');

    fireEvent.click(runtimeToggle('v2'));

    expect(
      screen.getByRole('button', { name: 'Activate v2' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('2.0.5')).not.toBeInTheDocument();
    expect(screen.queryByText('dbt v2 versions')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Installed from the Apache-licensed dbt-oss package/),
    ).toBeInTheDocument();
    // The toggle follows what is shown; the header still shows what is installed.
    expect(runtimeToggle('v1')).toHaveAttribute('aria-pressed', 'false');
    expect(runtimeToggle('v2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('v1 · 1.11.12 installed')).toBeInTheDocument();
    expect(planVersionChange).not.toHaveBeenCalled();
    expect(installVersionChange).not.toHaveBeenCalled();
  });

  it('replaces Activate v2 with a dropdown on the latest stable and an Install button', async () => {
    renderSettings();

    const dropdown = await openVersionDropdown('v2');

    expect(dropdown).toHaveTextContent('2.0.5 (latest stable)');
    expect(runtimeInstallButton()).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Activate v2' }),
    ).not.toBeInTheDocument();
    expect(planVersionChange).not.toHaveBeenCalled();
  });

  it('installs the version picked in the dropdown', async () => {
    renderSettings();

    fireEvent.mouseDown(await openVersionDropdown('v2'));
    fireEvent.click(await screen.findByRole('option', { name: '2.0.4' }));
    fireEvent.click(runtimeInstallButton());

    await waitFor(() =>
      expect(planVersionChange).toHaveBeenCalledWith({
        targetVersion: '2.0.4',
        includeAdapters: true,
      }),
    );
  });

  it('offers at most 15 versions when activating v1 from v2', async () => {
    mockVersionList([
      stableItem,
      ...Array.from({ length: 20 }, (_, index) =>
        olderStableItem(`1.10.${20 - index}`),
      ),
    ]);
    renderSettings({ dbtVersion: '2.0.5' });

    fireEvent.mouseDown(await openVersionDropdown('v1'));

    const options = await screen.findAllByRole('option');
    expect(options).toHaveLength(15);
    expect(options[0]).toHaveTextContent('1.11.12 (latest stable)');
  });

  it('shows the v1 versions without Python previews', async () => {
    renderSettings();

    fireEvent.click(runtimeToggle('v1'));

    expect(await screen.findByText('Latest stable')).toBeInTheDocument();
    previousStableItems.forEach(({ version }) => {
      expect(screen.getByText(version)).toBeInTheDocument();
    });
    expect(screen.queryByText('1.12.0rc2')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Active' })).toBeDisabled();
  });

  it('explains a v1 to v2 switch before installing', async () => {
    renderSettings();

    await openV2InstallDialog();

    expect(planVersionChange).toHaveBeenCalledWith({
      targetVersion: '2.0.5',
      includeAdapters: true,
    });
    expect(
      screen.getByText('dbt Core v1 · Python 1.11.12 will be uninstalled.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('dbt Core v2 · Rust 2.0.5 will be installed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Your adapter packages stay installed.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('You can roll back to 1.11.12 afterwards.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Be careful')).toBeInTheDocument();
    expect(
      screen.getByText(
        'This changes the global dbt-core version used by all local projects.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apache-licensed dbt-core package/),
    ).toBeInTheDocument();
    expect(installVersionChange).not.toHaveBeenCalled();
  });

  it('switches after confirmation and offers a rollback', async () => {
    installVersionChange.mockResolvedValue({
      ok: true,
      installedVersion: '2.0.5',
      dbtPath: '/managed/venv/bin/dbt',
      previousVersion: '1.11.12',
      adapterWarnings: [],
    });
    renderSettings();

    await openV2InstallDialog();
    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /Check current project after install/,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Switch to v2' }));

    await waitFor(() =>
      expect(installVersionChange).toHaveBeenCalledWith(
        expect.objectContaining({ targetVersion: '2.0.5' }),
      ),
    );
    expect(
      await screen.findByText('Verified dbt-core 2.0.5 is now active.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Roll back to 1.11.12' }),
    ).toBeInTheDocument();
  });

  it('shows older versions only when a runtime has more than five', async () => {
    mockVersionList([
      stableItem,
      ...previousStableItems,
      olderStableItem('1.11.7'),
      olderStableItem('1.11.6'),
    ]);
    renderSettings();

    fireEvent.click(runtimeToggle('v1'));
    expect(await screen.findByText('1.11.8')).toBeInTheDocument();
    expect(screen.queryByText('1.11.7')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Show older versions' }),
    );
    expect(screen.getByText('1.11.7')).toBeInTheDocument();
    expect(screen.getByText('1.11.6')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Show fewer' }),
    ).toBeInTheDocument();

    // The runtime that is not installed has no version list at all.
    fireEvent.click(runtimeToggle('v2'));
    expect(
      await screen.findByRole('button', { name: 'Activate v2' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Show older versions|Show fewer/ }),
    ).not.toBeInTheDocument();
  });

  it('asks for Python 3.11+ instead of planning v2 when Python is missing', async () => {
    renderSettings({ pythonPath: '' });

    await clickNewestV2Version();

    expect(
      await screen.findByText(/dbt Core 2.x requires Python 3.11 or newer/),
    ).toBeInTheDocument();
    expect(planVersionChange).not.toHaveBeenCalled();
  });

  it('preserves every adapter failure from the package install loop', async () => {
    installLatestPackage.mockImplementation(
      async ({ packageName }: { packageName: string }) =>
        ['dbt-postgres', 'dbt-bigquery'].includes(packageName)
          ? { ok: false, error: `${packageName} failed` }
          : { ok: true },
    );
    renderSettings({ dbtPath: 'dbt' });

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Install Selected Packages (9)',
      }),
    );

    expect(await screen.findByText(/dbt-postgres failed/)).toHaveTextContent(
      'dbt-bigquery failed',
    );
  });

  describe('install queue', () => {
    const installedAdapters = {
      'dbt-postgres': '1.9.0',
      'dbt-duckdb': '1.11.0',
    };

    // The page loads installed packages after a 1s delay; a busy full test
    // run can take a few seconds more.
    const loadTimeout = { timeout: 6000 };

    // The version list's own Queued button (the versions row also has a
    // Queued chip, which is a button too).
    const queuedVersionButton = () =>
      waitFor(() => {
        const button = screen
          .getAllByRole('button', { name: 'Queued' })
          .find((element) => element.classList.contains('MuiButton-root'));
        if (!button) throw new Error('Version list not shown yet');
        return button;
      }, loadTimeout);

    // Adapter rows list dbt-postgres first and dbt-duckdb after it.
    const uninstallButtons = async () =>
      screen.findAllByRole('button', { name: 'Uninstall' }, loadTimeout);

    it('shows Queued with a cancel on the clicked adapter and greys only its other buttons', async () => {
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      mockTasks = [dbtTask('dbt-postgres@1.9.1')];
      renderSettings();

      const queuedChip = (await screen.findByText('Queued')).closest(
        '.MuiChip-root',
      ) as HTMLElement;
      const [postgresUninstall, ...otherUninstalls] = await uninstallButtons();
      expect(postgresUninstall).toBeDisabled();
      otherUninstalls.forEach((button) => expect(button).toBeEnabled());

      fireEvent.click(
        queuedChip.querySelector('.MuiChip-deleteIcon') as Element,
      );
      expect(mockCancelTask).toHaveBeenCalledWith('task-dbt-postgres@1.9.1');
    });

    it('shows Uninstall once a queued install finishes, without leaving the page', async () => {
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      mockTasks = [dbtTask('dbt-snowflake@1.12.4', 'running')];
      const settings = {
        dbtPath: '/managed/venv/bin/dbt',
        dbtVersion: '1.11.12',
        pythonPath: '/managed/venv/bin/python3',
        pythonVersion: '3.12.0',
      } as any;
      const { rerender } = render(
        <DbtSettings settings={settings} onInstallDbtSave={jest.fn()} />,
      );
      expect(await uninstallButtons()).toHaveLength(2);
      expect(screen.queryByText('v1.12.4')).not.toBeInTheDocument();

      // The install finishes: it leaves the queue, and pip now lists it.
      getInstalledPackages.mockResolvedValue({
        packages: { ...installedAdapters, 'dbt-snowflake': '1.12.4' },
      });
      mockTasks = [];
      rerender(
        <DbtSettings settings={settings} onInstallDbtSave={jest.fn()} />,
      );

      expect(await screen.findByText('v1.12.4')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Uninstall' })).toHaveLength(
        3,
      );
    });

    it('shows Uninstall as soon as a picked adapter version finishes installing', async () => {
      // The full re-check doesn't list it yet, so only the install's own
      // result can switch the row.
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      listPackageVersions.mockResolvedValue({
        versions: [{ version: '1.12.4', isPrerelease: false }],
        latestStable: '1.12.4',
      });
      installPackageVersion.mockResolvedValue({
        ok: true,
        installedVersion: '1.12.4',
      });
      renderSettings();
      expect(await uninstallButtons()).toHaveLength(2);

      const snowflakeRow = screen.getByRole('group', {
        name: /^dbt-snowflake/,
      });
      fireEvent.click(
        within(snowflakeRow).getByRole('button', { name: 'Show details' }),
      );
      const versionRow = await screen.findByRole('group', {
        name: /^1\.12\.4/,
      });
      fireEvent.click(
        within(versionRow).getByRole('button', { name: 'Install' }),
      );

      expect(await screen.findByText('v1.12.4')).toBeInTheDocument();
      expect(screen.getAllByRole('button', { name: 'Uninstall' })).toHaveLength(
        3,
      );
      expect(installPackageVersion).toHaveBeenCalledWith(
        expect.objectContaining({
          packageName: 'dbt-snowflake',
          version: '1.12.4',
        }),
      );
    });

    it('shows In progress without a cancel once the install runs', async () => {
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      mockTasks = [dbtTask('dbt-postgres', 'running')];
      renderSettings();

      expect(await screen.findByText('In progress')).toBeInTheDocument();
      expect(screen.queryByText('Queued')).not.toBeInTheDocument();
      const [postgresUninstall] = await uninstallButtons();
      expect(postgresUninstall).toBeDisabled();
    });

    it('puts every adapter in the queue at once for Install All Adapters', async () => {
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      // Never resolves, like installs still waiting in the queue.
      installLatestPackage.mockReturnValue(new Promise(() => {}));
      renderSettings();
      // Already-installed adapters are skipped once the list has loaded.
      await screen.findByText('v1.9.0', {}, loadTimeout);

      fireEvent.click(
        await screen.findByRole('button', { name: 'Install All Adapters' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      await waitFor(() =>
        expect(installLatestPackage).toHaveBeenCalledTimes(5),
      );
      expect(
        installLatestPackage.mock.calls.map(([request]) => request.packageName),
      ).toEqual([
        'dbt-snowflake',
        'dbt-bigquery',
        'dbt-redshift',
        'dbt-databricks',
        'dbt-kinetica',
      ]);
    });

    it('lets a v1 to v2 switch cancel the queued dbt installs', async () => {
      installVersionChange.mockResolvedValue({
        ok: true,
        installedVersion: '2.0.5',
        dbtPath: '/managed/venv/bin/dbt',
        previousVersion: '1.11.12',
        adapterWarnings: [],
      });
      mockTasks = [
        dbtTask('dbt-redshift', 'running'),
        dbtTask('dbt-bigquery'),
        dbtTask('dbt-snowflake@1.12.4'),
      ];
      renderSettings();

      await openV2InstallDialog();
      expect(
        screen.getByText(
          '2 queued dbt installs will be cancelled: dbt-bigquery, dbt-snowflake@1.12.4.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(
          'Installing dbt-redshift is running now and finishes first.',
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/dbt Core v2 comes with its own adapters/),
      ).toBeInTheDocument();
      expect(mockCancelTask).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Switch to v2' }));

      await waitFor(() =>
        expect(installVersionChange).toHaveBeenCalledWith(
          expect.objectContaining({ targetVersion: '2.0.5' }),
        ),
      );
      expect(mockCancelTask).toHaveBeenCalledTimes(2);
      expect(mockCancelTask).toHaveBeenCalledWith('task-dbt-bigquery');
      expect(mockCancelTask).toHaveBeenCalledWith('task-dbt-snowflake@1.12.4');
    });

    it('cancels a queued dbt Core version from its ✕', async () => {
      mockTasks = [dbtTask('dbt-core@1.11.11')];
      renderSettings();

      fireEvent.click(runtimeToggle('v1'));
      expect(await queuedVersionButton()).toBeDisabled();
      // One switch within v1 waits at a time.
      screen
        .getAllByRole('button', { name: 'Downgrade' })
        .forEach((button) => expect(button).toBeDisabled());

      const cancelButton = screen.getByRole('button', {
        name: 'Remove from the queue',
      });
      fireEvent.mouseOver(cancelButton);
      expect(await screen.findByRole('tooltip')).toHaveTextContent(
        'Remove from the queue. Nothing has been installed yet, so nothing needs cleaning up.',
      );
      fireEvent.click(cancelButton);
      expect(mockCancelTask).toHaveBeenCalledWith('task-dbt-core@1.11.11');
    });

    it('greys adapters while a switch to v2 is queued', async () => {
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      mockTasks = [dbtTask('dbt-core@2.0.5')];
      renderSettings();

      (await uninstallButtons()).forEach((button) =>
        expect(button).toBeDisabled(),
      );
      expect(
        screen.getByRole('button', { name: 'Install All Adapters' }),
      ).toBeDisabled();

      // v2 is not installed, so its queued switch shows on the Activate
      // dropdown's Install button (2.0.5 is the default pick).
      await openVersionDropdown('v2');
      expect(await queuedVersionButton()).toBeDisabled();
      expect(
        screen.getByRole('button', { name: 'Remove from the queue' }),
      ).toBeInTheDocument();
    });

    describe('tooltips', () => {
      const tooltipText = async (element: HTMLElement) => {
        fireEvent.mouseOver(element);
        return (await screen.findByRole('tooltip')).textContent;
      };

      it('explains what a running install is doing', async () => {
        getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
        mockTasks = [dbtTask('dbt-postgres@1.9.1', 'running')];
        renderSettings();

        const text = await tooltipText(await screen.findByText('In progress'));
        expect(text).toContain('Installing dbt-postgres 1.9.1 now.');
        expect(text).toContain("It can't be stopped safely now.");
        expect(text).toContain(
          'Click to see the full queue in the Task Manager.',
        );
        expect(text).not.toMatch(/ago/);
      });

      it('says a queued install is next and what it waits for', async () => {
        getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
        mockTasks = [
          dbtTask('dbt-duckdb@1.11.0', 'running', 1),
          dbtTask('dbt-postgres@1.9.1', 'pending', 2),
        ];
        renderSettings();

        expect(await tooltipText(await screen.findByText('Queued'))).toContain(
          'dbt-postgres 1.9.1 is next. It starts when dbt-duckdb 1.11.0 finishes.',
        );
      });

      it('counts the installs ahead of a queued one', async () => {
        getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
        mockTasks = [
          dbtTask('dbt-duckdb@1.11.0', 'running', 1),
          dbtTask('dbt-snowflake', 'pending', 2),
          dbtTask('dbt-postgres@1.9.1', 'pending', 3),
        ];
        renderSettings();

        // Adapter rows list dbt-postgres before dbt-snowflake.
        const [postgresQueued] = await screen.findAllByText('Queued');
        expect(await tooltipText(postgresQueued)).toContain(
          'dbt-postgres 1.9.1 will start after 2 other installs finish. Now running: dbt-duckdb 1.11.0.',
        );
      });

      it('explains a queued dbt Core switch and opens the Task Manager on click', async () => {
        mockTasks = [dbtTask('dbt-core@1.11.11')];
        renderSettings();

        fireEvent.click(runtimeToggle('v1'));
        const queuedButton = await queuedVersionButton();
        expect(
          await tooltipText(queuedButton.parentElement as HTMLElement),
        ).toContain('The switch to dbt Core 1.11.11 is next.');

        fireEvent.click(queuedButton.parentElement as HTMLElement);
        expect(mockNavigate).toHaveBeenCalledWith('/app/settings/task-manager');
      });
    });

    it('shows a queued dbt Core switch on the versions row while the list is closed', async () => {
      mockTasks = [dbtTask('dbt-core@1.11.11')];
      renderSettings();

      expect(
        await screen.findByRole('button', { name: 'Show versions' }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByText('Queued'));
      expect(mockNavigate).toHaveBeenCalledWith('/app/settings/task-manager');

      fireEvent.click(
        (
          screen.getByText('Queued').closest('.MuiChip-root') as HTMLElement
        ).querySelector('.MuiChip-deleteIcon') as Element,
      );
      expect(mockCancelTask).toHaveBeenCalledWith('task-dbt-core@1.11.11');
    });

    it('shows In progress on the versions row while a switch runs', async () => {
      mockTasks = [dbtTask('dbt-core@1.11.11', 'running')];
      renderSettings();

      expect(await screen.findByText('In progress')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Show versions' }),
      ).toBeInTheDocument();
    });

    it("keeps dev's popup when Install All Adapters finishes", async () => {
      const success = jest.spyOn(toast, 'success');
      getInstalledPackages.mockResolvedValue({ packages: installedAdapters });
      installLatestPackage.mockResolvedValue({
        ok: true,
        installedVersion: '1.0.0',
      });
      renderSettings();
      await screen.findByText('v1.9.0', {}, loadTimeout);

      fireEvent.click(
        screen.getByRole('button', { name: 'Install All Adapters' }),
      );
      fireEvent.click(screen.getByRole('button', { name: 'OK' }));

      await waitFor(() =>
        expect(success).toHaveBeenCalledWith(
          'All 5 adapter(s) installed successfully.',
        ),
      );
      success.mockRestore();
    });
  });
});
