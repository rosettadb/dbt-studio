import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Setup from '../../../src/renderer/screens/setup';

let settings: Record<string, string>;
const updateSettings = jest.fn();
const installPythonMutate = jest.fn();
const installPythonMutateAsync = jest.fn();
const installRunnerMutate = jest.fn();
const getInstalledDbtCore = jest.fn();
const getDbtPath = jest.fn();
const getSettings = jest.fn();
const runCommand = jest.fn();

jest.mock('react-toastify', () => ({
  toast: { info: jest.fn(), error: jest.fn(), warning: jest.fn() },
}));

jest.mock('../../../src/renderer/config/client', () => ({
  client: { get: jest.fn() },
}));

jest.mock('../../../src/renderer/services', () => ({
  settingsServices: {
    getDbtPath: () => getDbtPath(),
    getSettings: () => getSettings(),
  },
}));

jest.mock('../../../src/renderer/hooks', () => ({
  useCli: () => ({ runCommand }),
}));

// Only the setup components; the full components index pulls in the whole app.
jest.mock('../../../src/renderer/components', () => ({
  Loader: () => <div>Loading</div>,
  ...jest.requireActual('../../../src/renderer/components/finishSetup'),
  ...jest.requireActual('../../../src/renderer/components/pythonSetup'),
  ...jest.requireActual('../../../src/renderer/components/dbtSetup'),
  ...jest.requireActual('../../../src/renderer/components/runnerSetup'),
}));

jest.mock('../../../src/renderer/controllers', () => ({
  useGetSettings: () => ({ data: settings, isLoading: false }),
  useUpdateSettings: () => ({ mutateAsync: updateSettings }),
  useInstallPython: () => ({
    mutate: installPythonMutate,
    mutateAsync: installPythonMutateAsync,
    isLoading: false,
  }),
  useGetInstalledDbtCore: () => getInstalledDbtCore,
  useCheckRunnerVersions: (options: {
    onSuccess: (data: { latestStable: string }) => void;
  }) => ({
    mutate: () => options.onSuccess({ latestStable: '1.7.2' }),
    isLoading: false,
  }),
  useInstallRunnerVersion: () => ({
    mutate: installRunnerMutate,
    isLoading: false,
  }),
}));

const installedPython = {
  pythonPath: '/managed/venv/python',
  pythonVersion: '3.10.17',
};

describe('Setup wizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings = { isSetup: 'false', dbtPath: '', runnerPath: '' };
  });

  it('keeps Next disabled until Python, dbt and the runner are all installed', async () => {
    settings = { ...settings, ...installedPython, dbtPath: '/managed/dbt' };
    const { rerender } = render(<Setup />);

    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('setup-next-btn')).toBeDisabled();

    settings = {
      ...settings,
      runnerPath: '/runner/bin',
      runnerVersion: '1.7.2',
    };
    rerender(<Setup />);

    // The wizard stays on page 1 so the person can see what got installed.
    expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
    const nextButton = screen.getByTestId('setup-next-btn');
    await waitFor(() => expect(nextButton).toBeEnabled());

    fireEvent.click(nextButton);
    expect(screen.getByText('Step 2 of 2')).toBeInTheDocument();
    expect(screen.getByTestId('setup-step-complete')).toBeInTheDocument();
  });

  it('disables the other installs, Skip Setup and Next while one install runs', async () => {
    render(<Setup />);

    const runnerButton = screen.getByTestId('setup-install-runner-btn');
    await waitFor(() => expect(runnerButton).toBeEnabled());

    fireEvent.click(screen.getByTestId('setup-install-python-btn'));

    expect(installPythonMutate).toHaveBeenCalled();
    expect(screen.getByTestId('setup-install-btn')).toBeDisabled();
    expect(runnerButton).toBeDisabled();
    expect(screen.getByTestId('setup-skip-btn')).toBeDisabled();
    expect(screen.getByTestId('setup-next-btn')).toBeDisabled();
  });

  it('keeps the Python path that the dbt install just set up when saving dbt', async () => {
    // Python is missing, so the dbt install installs it first. The settings
    // the screen rendered with still have an empty Python path.
    installPythonMutateAsync.mockResolvedValue({
      success: true,
      path: '/managed/venv/python',
    });
    runCommand.mockResolvedValue(undefined);
    getDbtPath.mockResolvedValue('/managed/venv/dbt');
    getInstalledDbtCore.mockResolvedValue({
      version: '1.10.4',
      isExecutableVerified: true,
    });
    getSettings.mockResolvedValue({
      ...settings,
      ...installedPython,
    });

    render(<Setup />);
    fireEvent.click(screen.getByTestId('setup-install-btn'));

    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pythonPath: '/managed/venv/python',
        dbtPath: '/managed/venv/dbt',
        dbtVersion: '1.10.4',
      }),
    );
  });
});
