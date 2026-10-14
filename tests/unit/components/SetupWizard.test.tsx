import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
const saveSettings = jest.fn();
const listDbtCoreVersions = jest.fn();
const getInstalledDbtCore = jest.fn();
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
    updateSettings: (value: unknown) => saveSettings(value),
  },
}));

jest.mock('../../../src/renderer/services/dbtVersions.service', () => ({
  listDbtCoreVersions: (options: unknown) => listDbtCoreVersions(options),
  installPackageVersion: (request: unknown) => installPackageVersion(request),
  installLatestPackage: (request: unknown) => installLatestPackage(request),
  getInstalledDbtCore: () => getInstalledDbtCore(),
}));

jest.mock('../../../src/renderer/services/flowfile.service', () => ({
  flowfileInstall: () => flowfileInstall(),
}));

// Only the setup components; the full components index pulls in the whole app.
jest.mock('../../../src/renderer/components', () => ({
  ...jest.requireActual('../../../src/renderer/components/setupChoiceRow'),
  ...jest.requireActual('../../../src/renderer/components/dbtSetup'),
  ...jest.requireActual('../../../src/renderer/components/flowfileSetup'),
  ...jest.requireActual(
    '../../../src/renderer/components/setupInstallProgress',
  ),
}));

const goToInstallStep = () => {
  fireEvent.click(screen.getByTestId('setup-install-btn'));
};

const waitForVersionsToLoad = () =>
  waitFor(() =>
    expect(screen.getByTestId('setup-dbt-v1-summary')).not.toHaveTextContent(
      'Loading',
    ),
  );

const openSection = (testId: string) =>
  fireEvent.click(screen.getByTestId(`${testId}-header`));

const versionLabels = (line: 'v1' | 'v2') =>
  within(screen.getByTestId(`setup-dbt-versions-${line}`))
    .getAllByRole('radio')
    .map((radio) => radio.closest('label')?.textContent);

const pickVersion = (line: 'v1' | 'v2', version: string) =>
  fireEvent.click(
    within(screen.getByTestId(`setup-dbt-versions-${line}`)).getByRole(
      'radio',
      { name: version },
    ),
  );

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
        { version: '1.10.4', isLatestStable: false },
      ],
    });
    let installedDbtVersion = '';
    getInstalledDbtCore.mockImplementation(async () => ({
      version: installedDbtVersion,
    }));
    installPackageVersion.mockImplementation(
      async (request: { version: string }) => {
        installLog.push(`dbt ${request.version}`);
        installedDbtVersion = request.version;
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

  it('opens with everything collapsed and 1.x at its newest version', async () => {
    render(<Setup />);
    expect(screen.getByText('Rosetta Studio - Setup')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    await waitForVersionsToLoad();

    expect(screen.getByTestId('setup-dbt-v1-summary')).toHaveTextContent(
      '1.11.12 (latest)',
    );
    expect(screen.getByTestId('setup-adapters-summary')).toHaveTextContent(
      'All 7 selected',
    );
    expect(screen.getByTestId('setup-tools-summary')).toHaveTextContent('None');
    expect(
      screen.queryByTestId('setup-dbt-versions-v1'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('setup-adapter-checkboxes'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('setup-flowfile-checkbox'),
    ).not.toBeInTheDocument();
  });

  it('keeps only one section open at a time', async () => {
    render(<Setup />);
    await waitForVersionsToLoad();

    openSection('setup-adapters');
    expect(screen.getByTestId('setup-adapter-checkboxes')).toBeInTheDocument();

    openSection('setup-tools');
    expect(screen.getByTestId('setup-flowfile-checkbox')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId('setup-adapter-checkboxes'),
      ).not.toBeInTheDocument(),
    );

    openSection('setup-dbt-v2');
    expect(screen.getByTestId('setup-dbt-versions-v2')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByTestId('setup-flowfile-checkbox'),
      ).not.toBeInTheDocument(),
    );
  });

  it('installs dbt 1.x with the picked adapters and the runner, without a runner row', async () => {
    render(<Setup />);
    await waitForVersionsToLoad();

    // Untick one adapter so only the picked ones get installed.
    openSection('setup-adapters');
    fireEvent.click(screen.getByLabelText('dbt-kinetica'));
    expect(screen.getByTestId('setup-adapters-summary')).toHaveTextContent(
      '6 of 7 selected',
    );
    goToInstallStep();
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
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
    // The runner installs but has no row; Flowfile wasn't ticked.
    expect(screen.queryByText('Local runner')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('setup-install-row-flowfile'),
    ).not.toBeInTheDocument();
    expect(flowfileInstall).not.toHaveBeenCalled();
  });

  it('shows only the Python version, not its path', async () => {
    render(<Setup />);
    goToInstallStep();
    await waitForInstallsToFinish();

    const pythonRow = screen.getByTestId('setup-install-row-python');
    expect(pythonRow).toHaveTextContent('v3.10.17');
    expect(pythonRow).not.toHaveTextContent('/venv/python');
  });

  it('installs Python 3.11 before dbt 2.x and skips adapter packages', async () => {
    render(<Setup />);
    await waitForVersionsToLoad();
    openSection('setup-dbt-v2');
    expect(screen.getByTestId('setup-adapters-summary')).toHaveTextContent(
      '5 included with 2.x',
    );

    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog).toEqual(['python 3.11.12', 'dbt 2.0.3', 'runner 1.7.2']);
    expect(installLatestPackage).not.toHaveBeenCalled();
  });

  it('installs Flowfile last when it was ticked', async () => {
    render(<Setup />);
    openSection('setup-tools');
    fireEvent.click(screen.getByLabelText('Flowfile'));
    expect(screen.getByTestId('setup-tools-summary')).toHaveTextContent(
      'Flowfile',
    );
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog[installLog.length - 1]).toBe('flowfile');
    expect(
      screen.getByTestId('setup-install-row-flowfile'),
    ).toBeInTheDocument();
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
    flowfileInstall.mockResolvedValueOnce({
      ok: false,
      error: 'No internet connection',
    });

    render(<Setup />);
    openSection('setup-tools');
    fireEvent.click(screen.getByLabelText('Flowfile'));
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(screen.getByText('No internet connection')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('setup-retry-flowfile'));
    await waitFor(() =>
      expect(
        screen.queryByTestId('setup-retry-flowfile'),
      ).not.toBeInTheDocument(),
    );
    await waitForInstallsToFinish();

    expect(flowfileInstall).toHaveBeenCalledTimes(2);
    expect(installPackageVersion).toHaveBeenCalledTimes(1);
  });

  it('shows a short note only when the hidden runner install fails', async () => {
    installRunnerVersion.mockResolvedValueOnce({
      success: false,
      error: 'No internet connection',
    });

    render(<Setup />);
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(screen.getByTestId('setup-runner-failed')).toBeInTheDocument();
    expect(
      screen.queryByText('No internet connection'),
    ).not.toBeInTheDocument();
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

  it('picks a version, folds the row, and installs that version', async () => {
    render(<Setup />);
    await waitForVersionsToLoad();
    openSection('setup-dbt-v1');
    pickVersion('v1', '1.10.4');

    await waitFor(() =>
      expect(
        screen.queryByTestId('setup-dbt-versions-v1'),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('setup-dbt-v1-summary')).toHaveTextContent(
      '1.10.4',
    );

    goToInstallStep();
    expect(screen.getByText('dbt 1.10.4 and 7 adapters')).toBeInTheDocument();
    await waitForInstallsToFinish();

    expect(installLog[0]).toBe('dbt 1.10.4');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('lists only the opened line, newest first and marked latest', async () => {
    render(<Setup />);
    await waitForVersionsToLoad();
    openSection('setup-dbt-v2');

    expect(versionLabels('v2')).toEqual(['2.0.3latest', '2.0.2']);
  });

  it('installs the latest when the version list cannot load', async () => {
    listDbtCoreVersions.mockRejectedValueOnce(new Error('offline'));
    render(<Setup />);

    await waitFor(() =>
      expect(screen.getByTestId('setup-dbt-v1-summary')).toHaveTextContent(
        'Latest',
      ),
    );
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog[0]).toBe('dbt 1.11.12');
  });

  it('warns and corrects settings when an adapter changes the dbt version', async () => {
    getInstalledDbtCore.mockResolvedValue({ version: '1.11.12' });
    render(<Setup />);
    await waitForVersionsToLoad();
    openSection('setup-dbt-v1');
    pickVersion('v1', '1.10.4');

    goToInstallStep();
    await waitForInstallsToFinish();

    expect(
      screen.getByText('An adapter changed dbt to 1.11.12.'),
    ).toBeInTheDocument();
    expect(saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ dbtVersion: '1.11.12' }),
    );
  });

  it('lists at most the newest 15 versions of a line', async () => {
    listDbtCoreVersions.mockResolvedValue({
      versions: Array.from({ length: 20 }, (_, index) => ({
        version: `1.11.${20 - index}`,
      })),
    });
    render(<Setup />);
    await waitForVersionsToLoad();
    openSection('setup-dbt-v1');

    const labels = versionLabels('v1');
    expect(labels).toHaveLength(15);
    expect(labels[0]).toBe('1.11.20latest');
    expect(labels[14]).toBe('1.11.6');
  });
});
