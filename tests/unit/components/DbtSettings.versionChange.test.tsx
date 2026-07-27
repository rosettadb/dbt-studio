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

const previewItem = {
  version: '2.0.0a4',
  isPrerelease: true,
  isLatestStable: false,
  isInstalled: false,
  channel: 'preview' as const,
};

const previousStableItems = ['1.11.11', '1.11.10', '1.11.9', '1.11.8'].map(
  (version) => ({
    version,
    isPrerelease: false,
    isLatestStable: false,
    isInstalled: false,
    channel: 'stable' as const,
  }),
);

describe('DbtSettings version change flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getInstalledPackages.mockResolvedValue({ packages: {} });
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
    listVersions.mockImplementation(
      async ({ includePrerelease }: { includePrerelease?: boolean }) => ({
        versions: includePrerelease
          ? [previewItem, pythonPreviewItem, stableItem, ...previousStableItems]
          : [stableItem, ...previousStableItems],
        latestStable: '1.11.12',
        currentVersion: '1.11.12',
      }),
    );
    planVersionChange.mockResolvedValue({
      currentVersion: '1.11.12',
      targetVersion: '2.0.0a4',
      direction: 'preview-install',
      channel: 'preview',
      isMajorVersionChange: true,
      globalImpactWarning:
        'This changes the global dbt-core version used by all local projects.',
      warnings: ['This is a major dbt-core version change.'],
      adapters: [],
      rollbackVersion: '1.11.12',
    });
  });

  const renderSettings = () =>
    render(
      <DbtSettings
        settings={
          {
            dbtPath: 'dbt',
            dbtVersion: '1.11.12',
            pythonPath: '/managed/venv/bin/python3',
            pythonVersion: '3.12.0',
          } as any
        }
        onInstallDbtSave={jest.fn()}
      />,
    );

  it('shows Python and Rust runtimes together and opens global confirmation', async () => {
    renderSettings();

    expect(await screen.findByText('1.11.12')).toBeInTheDocument();
    expect(screen.getByText('2.0.0a4')).toBeInTheDocument();
    expect(screen.getByText('dbt Core v1')).toBeInTheDocument();
    expect(screen.getByText('dbt Core v2')).toBeInTheDocument();
    expect(screen.queryByText(/Fusion/)).not.toBeInTheDocument();
    expect(screen.queryByText('1.12.0rc2')).not.toBeInTheDocument();
    expect(screen.queryByText(/Show preview/)).not.toBeInTheDocument();
    previousStableItems.forEach(({ version }) => {
      expect(screen.getByText(version)).toBeInTheDocument();
    });
    expect(listVersions).toHaveBeenCalledWith({
      includePrerelease: true,
      limit: 100,
    });
    expect(screen.getByRole('button', { name: 'Installed' })).toBeDisabled();
    expect(screen.getByText('Latest stable')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Install Preview' }));

    expect(
      await screen.findByText('Confirm global dbt-core version change'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'This changes the global dbt-core version used by all local projects.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Apache-licensed dbt-core package/),
    ).toBeInTheDocument();
  });

  it('shows a verified result and rollback action after confirmation', async () => {
    installVersionChange.mockResolvedValue({
      ok: true,
      installedVersion: '2.0.0a4',
      dbtPath: '/managed/venv/bin/dbt',
      previousVersion: '1.11.12',
      adapterWarnings: [],
    });
    renderSettings();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Install Preview' }),
    );
    await screen.findByText('Confirm global dbt-core version change');
    fireEvent.click(
      await screen.findByRole('checkbox', {
        name: /Check current project after install/,
      }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Confirm version change' }),
    );

    await waitFor(() =>
      expect(installVersionChange).toHaveBeenCalledWith(
        expect.objectContaining({ targetVersion: '2.0.0a4' }),
      ),
    );
    expect(
      await screen.findByText('Verified dbt-core 2.0.0a4 is now active.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: 'Roll back to 1.11.12' }),
    ).toBeInTheDocument();
  });

  it('preserves every adapter failure from the package install loop', async () => {
    installLatestPackage.mockImplementation(
      async ({ packageName }: { packageName: string }) =>
        ['dbt-postgres', 'dbt-bigquery'].includes(packageName)
          ? { ok: false, error: `${packageName} failed` }
          : { ok: true },
    );
    renderSettings();

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Install Selected Packages (8)',
      }),
    );

    expect(await screen.findByText(/dbt-postgres failed/)).toHaveTextContent(
      'dbt-bigquery failed',
    );
  });
});
