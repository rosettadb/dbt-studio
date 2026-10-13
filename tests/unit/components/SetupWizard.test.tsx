import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Setup from '../../../src/renderer/screens/setup';

// Every install records its name here, so tests can check the order.
let installLog: string[];
let settings: Record<string, string>;
const updateSettings = jest.fn();
const installPython = jest.fn();
const installPythonVersion = jest.fn();
const checkPythonVersions = jest.fn();
const checkRunnerVersions = jest.fn();
const installRunnerVersion = jest.fn();
const listDbtCoreVersions = jest.fn();
const installPackageVersion = jest.fn();
const installLatestPackage = jest.fn();
const flowfileInstall = jest.fn();

jest.mock('react-toastify', () => ({
  toast: { info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('../../../src/renderer/config/client', () => ({
  client: { get: jest.fn() },
}));

jest.mock('../../../src/renderer/controllers', () => ({
  useUpdateSettings: () => ({ mutateAsync: updateSettings }),
}));

jest.mock('../../../src/renderer/services', () => ({
  settingsServices: {
    getSettings: async () => settings,
    installPython: () => installPython(),
    installPythonVersion: (version: string) => installPythonVersion(version),
    checkPythonVersions: () => checkPythonVersions(),
    checkRunnerVersions: () => checkRunnerVersions(),
    installRunnerVersion: (version: string) => installRunnerVersion(version),
  },
}));

jest.mock('../../../src/renderer/services/dbtVersions.service', () => ({
  listDbtCoreVersions: (options: unknown) => listDbtCoreVersions(options),
  installPackageVersion: (request: unknown) => installPackageVersion(request),
  installLatestPackage: (request: unknown) => installLatestPackage(request),
}));

jest.mock('../../../src/renderer/services/flowfile.service', () => ({
  flowfileInstall: () => flowfileInstall(),
}));

// Only the setup components; the full components index pulls in the whole app.
jest.mock('../../../src/renderer/components', () => ({
  ...jest.requireActual('../../../src/renderer/components/dbtSetup'),
  ...jest.requireActual('../../../src/renderer/components/flowfileSetup'),
  ...jest.requireActual(
    '../../../src/renderer/components/setupInstallProgress',
  ),
}));

const goToInstallStep = () => {
  fireEvent.click(screen.getByTestId('setup-next-btn'));
  fireEvent.click(screen.getByTestId('setup-install-btn'));
};

const waitForInstallsToFinish = () =>
  waitFor(() => expect(screen.getByTestId('setup-finish-btn')).toBeEnabled());

describe('Setup wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    installLog = [];
    settings = {
      isSetup: 'false',
      pythonPath: '/venv/python',
      pythonVersion: '3.10.17',
      runnerPath: '',
    };

    installPython.mockImplementation(async () => {
      installLog.push('python');
      return { success: true, version: '3.10.17', path: '/venv/python' };
    });
    checkPythonVersions.mockResolvedValue({
      availableVersions: [
        { version: '3.10.17' },
        { version: '3.11.12' },
        { version: '3.12.10' },
      ],
    });
    installPythonVersion.mockImplementation(async (version: string) => {
      installLog.push(`python ${version}`);
      settings = { ...settings, pythonVersion: version };
      return { success: true, version, path: '/venv/python' };
    });
    listDbtCoreVersions.mockResolvedValue({
      versions: [
        { version: '2.0.3', isLatestStable: true },
        { version: '2.0.2', isLatestStable: false },
        { version: '1.11.12', isLatestStable: true },
        { version: '1.11.11', isLatestStable: false },
      ],
    });
    installPackageVersion.mockImplementation(
      async (request: { version: string }) => {
        installLog.push(`dbt ${request.version}`);
        return {
          ok: true,
          installedVersion: request.version,
          dbtPath: '/venv/dbt',
        };
      },
    );
    installLatestPackage.mockImplementation(
      async (request: { packageName: string }) => {
        installLog.push(request.packageName);
        return { ok: true };
      },
    );
    checkRunnerVersions.mockResolvedValue({ latestStable: '1.7.2' });
    installRunnerVersion.mockImplementation(async (version: string) => {
      installLog.push(`runner ${version}`);
      return { success: true, version, path: '/runner/bin' };
    });
    flowfileInstall.mockImplementation(async () => {
      installLog.push('flowfile');
      return { ok: true };
    });
  });

  it('installs dbt 1.x with the picked adapters, then the runner', async () => {
    render(<Setup />);
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();

    // Untick one adapter so only the picked ones get installed.
    fireEvent.click(screen.getByLabelText('dbt-kinetica'));
    goToInstallStep();
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    await waitForInstallsToFinish();

    expect(installLog).toEqual([
      'dbt 1.11.12',
      'dbt-postgres',
      'dbt-snowflake',
      'dbt-bigquery',
      'dbt-redshift',
      'dbt-databricks',
      'dbt-duckdb',
      'runner 1.7.2',
    ]);
    // Python was already installed at app startup, so it isn't reinstalled.
    expect(installPython).not.toHaveBeenCalled();
    expect(flowfileInstall).not.toHaveBeenCalled();
  });

  it('installs Python 3.11 before dbt 2.x and skips adapter packages', async () => {
    render(<Setup />);
    fireEvent.click(screen.getByLabelText('dbt Core 2.x'));
    expect(screen.getByTestId('setup-adapter-included')).toBeInTheDocument();

    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog).toEqual(['python 3.11.12', 'dbt 2.0.3', 'runner 1.7.2']);
    expect(installLatestPackage).not.toHaveBeenCalled();
  });

  it('installs Flowfile last, only when it was ticked', async () => {
    render(<Setup />);
    fireEvent.click(screen.getByTestId('setup-next-btn'));
    fireEvent.click(screen.getByLabelText('Flowfile'));
    fireEvent.click(screen.getByTestId('setup-install-btn'));
    await waitForInstallsToFinish();

    expect(installLog[installLog.length - 1]).toBe('flowfile');
  });

  it('keeps Finish disabled while installs run', async () => {
    let finishDbtInstall = () => {};
    installPackageVersion.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishDbtInstall = () =>
            resolve({ ok: true, installedVersion: '1.11.12', dbtPath: 'd' });
        }),
    );

    render(<Setup />);
    goToInstallStep();

    await waitFor(() => expect(installPackageVersion).toHaveBeenCalled());
    expect(screen.getByTestId('setup-finish-btn')).toBeDisabled();
    expect(screen.queryByTestId('setup-skip-btn')).not.toBeInTheDocument();

    finishDbtInstall();
    await waitForInstallsToFinish();
  });

  it('shows a failed install with Retry, which reruns only that row', async () => {
    installRunnerVersion.mockResolvedValueOnce({
      success: false,
      error: 'No internet connection',
    });

    render(<Setup />);
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(screen.getByText('No internet connection')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('setup-retry-runner'));
    await waitFor(() =>
      expect(
        screen.queryByTestId('setup-retry-runner'),
      ).not.toBeInTheDocument(),
    );
    await waitForInstallsToFinish();

    expect(installRunnerVersion).toHaveBeenCalledTimes(2);
    expect(installPackageVersion).toHaveBeenCalledTimes(1);
  });

  it('saves setup as done with the settings the installs wrote', async () => {
    render(<Setup />);
    goToInstallStep();
    await waitForInstallsToFinish();

    // The installs save new paths in the main process; Finish must keep them.
    settings = { ...settings, dbtPath: '/venv/dbt', runnerPath: '/runner/bin' };
    fireEvent.click(screen.getByTestId('setup-finish-btn'));

    await waitFor(() =>
      expect(updateSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          isSetup: 'true',
          dbtPath: '/venv/dbt',
          runnerPath: '/runner/bin',
        }),
      ),
    );
  });
});
