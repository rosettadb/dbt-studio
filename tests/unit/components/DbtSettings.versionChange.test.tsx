import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DbtSettings } from '../../../src/renderer/components/settings/DbtSettings';

const listVersions = jest.fn();
const planVersionChange = jest.fn();
const installVersionChange = jest.fn();
const installPackageVersion = jest.fn();
const installLatestPackage = jest.fn();
const getInstalledPackages = jest.fn();
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
  useListPackageVersions: () => jest.fn(),
  usePlanDbtVersionChange: () => planVersionChange,
  useInstallDbtVersionChange: () => installVersionChange,
  useCheckCurrentProjectCompatibility: () => jest.fn(),
  useGetActiveAdapterCapabilities: () => getActiveAdapterCapabilities,
  useInstallPython: () => ({ mutateAsync: installPython }),
}));

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
    pythonPath = '/managed/venv/bin/python3',
  } = {}) =>
    render(
      <DbtSettings
        settings={
          {
            dbtPath,
            dbtVersion: '1.11.12',
            pythonPath,
            pythonVersion: '3.12.0',
          } as any
        }
        onInstallDbtSave={jest.fn()}
      />,
    );

  const runtimeToggle = (runtime: 'v1' | 'v2') =>
    screen.getByRole('button', { name: `Show dbt ${runtime} versions` });

  // Clicks the action on the newest v2 row (2.0.5, listed first).
  const clickNewestV2Version = async () => {
    fireEvent.click(runtimeToggle('v2'));
    const [newestV2Action] = await screen.findAllByRole('button', {
      name: 'Switch to this version',
    });
    fireEvent.click(newestV2Action);
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

  it('shows v2 versions without installing when dbt v2 is clicked', async () => {
    renderSettings();

    fireEvent.click(runtimeToggle('v2'));

    expect(await screen.findByText('2.0.5')).toBeInTheDocument();
    expect(screen.getByText('2.0.4')).toBeInTheDocument();
    expect(screen.getByText('Latest stable')).toBeInTheDocument();
    expect(screen.queryByText(/Preview/)).not.toBeInTheDocument();
    expect(screen.getByText('dbt v2 versions')).toBeInTheDocument();
    expect(
      screen.getByText(/Installed from the Apache-licensed dbt-oss package/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Installing a version below switches to dbt v2/),
    ).toBeInTheDocument();
    expect(screen.queryByText('1.11.11')).not.toBeInTheDocument();
    // The toggle follows what is shown; the header still shows what is installed.
    expect(runtimeToggle('v1')).toHaveAttribute('aria-pressed', 'false');
    expect(runtimeToggle('v2')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('v1 · 1.11.12 installed')).toBeInTheDocument();
    expect(planVersionChange).not.toHaveBeenCalled();
    expect(installVersionChange).not.toHaveBeenCalled();
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

    fireEvent.click(runtimeToggle('v2'));
    expect(await screen.findByText('2.0.5')).toBeInTheDocument();
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
});
