import React from 'react';
import {
  act,
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
  ...jest.requireActual('../../../src/renderer/components/dbtSetup'),
  ...jest.requireActual('../../../src/renderer/components/flowfileSetup'),
  ...jest.requireActual(
    '../../../src/renderer/components/setupInstallProgress',
  ),
}));

const pickLine = (line: 'v1' | 'v2') =>
  fireEvent.click(screen.getByTestId(`setup-dbt-${line}`));

const pickVersion = async (version: string) =>
  fireEvent.click(await screen.findByTestId(`setup-dbt-version-${version}`));

const continueFrom = (choice: 'adapters' | 'tools') =>
  fireEvent.click(screen.getByTestId(`setup-continue-${choice}`));

// Walks the four choices with the given line and version, keeping defaults.
const makeChoices = async (line: 'v1' | 'v2', version: string) => {
  pickLine(line);
  await pickVersion(version);
  continueFrom('adapters');
  continueFrom('tools');
};

const goToInstallStep = () => {
  fireEvent.click(screen.getByTestId('setup-install-btn'));
};

const versionLabels = () =>
  within(screen.getByTestId('setup-dbt-versions'))
    .getAllByRole('radio')
    .map((option) => option.textContent);

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

  it('opens on the dbt version step with Install off', async () => {
    render(<Setup />);
    // Let the version list finish loading in the background.
    await act(async () => {});
    expect(screen.getByText('Rosetta Studio - Setup')).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(
      screen.getByText('Which dbt™ version would you like to install?'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('setup-dbt-v1')).toBeInTheDocument();
    expect(screen.queryByTestId('setup-dbt-versions')).not.toBeInTheDocument();
    expect(screen.getByTestId('setup-install-btn')).toBeDisabled();
  });

  it('opens each step after the previous one is made', async () => {
    render(<Setup />);

    pickLine('v1');
    expect(screen.getByTestId('setup-summary-line')).toHaveTextContent(
      'dbt 1.x',
    );
    expect(await screen.findByText('Which version of dbt 1.x?')).toBeVisible();
    // Nothing is pre-picked; the newest is only marked "latest".
    expect(screen.getByTestId('setup-dbt-version-1.11.12')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByTestId('setup-dbt-version-1.11.12')).toHaveTextContent(
      'latest',
    );

    await pickVersion('1.10.4');
    expect(screen.getByTestId('setup-summary-version')).toHaveTextContent(
      '1.10.4',
    );
    expect(screen.getByTestId('setup-adapter-checkboxes')).toBeInTheDocument();
    expect(screen.getByTestId('setup-install-btn')).toBeDisabled();

    continueFrom('adapters');
    expect(screen.getByTestId('setup-summary-adapters')).toHaveTextContent(
      'All 7 adapters',
    );
    expect(screen.getByTestId('setup-flowfile-checkbox')).toBeInTheDocument();

    continueFrom('tools');
    expect(screen.getByTestId('setup-summary-tools')).toHaveTextContent('None');
    expect(screen.getByTestId('setup-install-btn')).toBeEnabled();
  });

  it('reopens a finished step with Change and keeps the rest done', async () => {
    render(<Setup />);
    await makeChoices('v1', '1.10.4');

    fireEvent.click(screen.getByTestId('setup-change-version'));
    await pickVersion('1.11.12');

    expect(screen.getByTestId('setup-summary-version')).toHaveTextContent(
      '1.11.12 (latest)',
    );
    expect(screen.getByTestId('setup-summary-tools')).toBeInTheDocument();
    expect(screen.getByTestId('setup-install-btn')).toBeEnabled();
  });

  it('starts over with no version picked when the dbt line changes', async () => {
    render(<Setup />);
    await makeChoices('v1', '1.10.4');

    fireEvent.click(screen.getByTestId('setup-change-line'));
    pickLine('v2');

    expect(await screen.findByText('Which version of dbt 2.x?')).toBeVisible();
    expect(
      within(screen.getByTestId('setup-dbt-versions')).queryByRole('radio', {
        checked: true,
      }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('setup-install-btn')).toBeDisabled();
  });

  it('installs dbt 1.x with the picked adapters and the runner, without a runner row', async () => {
    render(<Setup />);
    pickLine('v1');
    await pickVersion('1.11.12');
    // Untick one adapter so only the picked ones get installed.
    fireEvent.click(screen.getByLabelText('dbt-kinetica'));
    continueFrom('adapters');
    expect(screen.getByTestId('setup-summary-adapters')).toHaveTextContent(
      '6 of 7 adapters',
    );
    continueFrom('tools');
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
    await makeChoices('v1', '1.11.12');
    goToInstallStep();
    await waitForInstallsToFinish();

    const pythonRow = screen.getByTestId('setup-install-row-python');
    expect(pythonRow).toHaveTextContent('v3.10.17');
    expect(pythonRow).not.toHaveTextContent('/venv/python');
  });

  it('installs Python 3.11 before dbt 2.x and skips adapter packages', async () => {
    render(<Setup />);
    pickLine('v2');
    await pickVersion('2.0.3');
    expect(screen.getByTestId('setup-adapter-included')).toBeInTheDocument();
    continueFrom('adapters');
    expect(screen.getByTestId('setup-summary-adapters')).toHaveTextContent(
      '5 built-in adapters',
    );
    continueFrom('tools');
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog).toEqual(['python 3.11.12', 'dbt 2.0.3', 'runner 1.7.2']);
    expect(installLatestPackage).not.toHaveBeenCalled();
  });

  it('installs Flowfile last when it was ticked', async () => {
    render(<Setup />);
    pickLine('v1');
    await pickVersion('1.11.12');
    continueFrom('adapters');
    fireEvent.click(screen.getByLabelText('Flowfile'));
    continueFrom('tools');
    expect(screen.getByTestId('setup-summary-tools')).toHaveTextContent(
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
    await makeChoices('v1', '1.11.12');
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
    pickLine('v1');
    await pickVersion('1.11.12');
    continueFrom('adapters');
    fireEvent.click(screen.getByLabelText('Flowfile'));
    continueFrom('tools');
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
    await makeChoices('v1', '1.11.12');
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(screen.getByTestId('setup-runner-failed')).toBeInTheDocument();
    expect(
      screen.queryByText('No internet connection'),
    ).not.toBeInTheDocument();
  });

  it('saves setup as done with the settings the installs wrote', async () => {
    render(<Setup />);
    await makeChoices('v1', '1.11.12');
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

  it('installs the dbt version that was picked', async () => {
    render(<Setup />);
    await makeChoices('v1', '1.10.4');
    goToInstallStep();
    expect(screen.getByText('dbt 1.10.4 and 7 adapters')).toBeInTheDocument();
    await waitForInstallsToFinish();

    expect(installLog[0]).toBe('dbt 1.10.4');
    expect(saveSettings).not.toHaveBeenCalled();
  });

  it('lists only the picked line, newest first and marked latest', async () => {
    render(<Setup />);
    pickLine('v2');
    await screen.findByTestId('setup-dbt-versions');

    expect(versionLabels()).toEqual(['2.0.3latest', '2.0.2']);
  });

  it('installs the latest when the version list cannot load', async () => {
    listDbtCoreVersions.mockRejectedValueOnce(new Error('offline'));
    render(<Setup />);
    pickLine('v1');
    await pickVersion('latest');
    continueFrom('adapters');
    continueFrom('tools');
    expect(screen.getByTestId('setup-summary-version')).toHaveTextContent(
      'Latest',
    );
    goToInstallStep();
    await waitForInstallsToFinish();

    expect(installLog[0]).toBe('dbt 1.11.12');
  });

  it('warns and corrects settings when an adapter changes the dbt version', async () => {
    getInstalledDbtCore.mockResolvedValue({ version: '1.11.12' });
    render(<Setup />);
    await makeChoices('v1', '1.10.4');
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
    pickLine('v1');
    await screen.findByTestId('setup-dbt-versions');

    const labels = versionLabels();
    expect(labels).toHaveLength(15);
    expect(labels[0]).toBe('1.11.20latest');
    expect(labels[14]).toBe('1.11.6');
  });
});
