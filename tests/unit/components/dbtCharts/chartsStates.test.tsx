import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockStatus = jest.fn();
const mockState = jest.fn();
jest.mock('../../../../src/renderer/controllers', () => ({
  useDbtChartsStatus: () => mockStatus(),
  useDbtChartsProjectState: () => mockState(),
  useDbtChartsInstallProgress: () => null,
  useInstallDbtCharts: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useSetupDbtCharts: () => ({ mutateAsync: jest.fn(), isLoading: false }),
  useEnsureManifest: () => ({ mutateAsync: jest.fn(), isLoading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { error: jest.fn() } }));

// eslint-disable-next-line import/first
import { ChartsStateGate } from '../../../../src/renderer/components/dbtCharts/ChartsSetupStates';

const project: any = { id: 'p1', path: '/p', connection: { type: 'postgres' } };
const ready = {
  support: { supported: true, extra: 'postgresql' },
  configExists: true,
  boards: [],
  manifestStale: false,
  extraInstalled: true,
};
const installed = {
  installed: true,
  version: '1',
  pythonVersion: '3.11',
  extras: [],
};

const setup = (status: any, state: any, p: any = project) => {
  mockStatus.mockReturnValue({ data: status, isLoading: false });
  mockState.mockReturnValue({ data: state, isLoading: false });
  render(
    <ChartsStateGate project={p}>
      <div>READY</div>
    </ChartsStateGate>,
  );
};

describe('ChartsStateGate', () => {
  it('unsupported connection shows the reason, nothing to install', () => {
    setup(installed, {
      ...ready,
      support: {
        supported: false,
        reason: 'dbt Charts does not support mysql connections yet.',
      },
    });
    expect(screen.getByText(/does not support mysql/)).toBeInTheDocument();
    expect(screen.queryByTestId('dbt-charts-install-btn')).toBeNull();
  });

  it('not installed offers install', () => {
    setup({ ...installed, installed: false }, ready);
    expect(screen.getByTestId('dbt-charts-install-btn')).toHaveTextContent(
      'Install dbt Charts',
    );
  });

  it('missing adapter extra offers adapter install', () => {
    setup(installed, { ...ready, extraInstalled: false });
    expect(screen.getByTestId('dbt-charts-install-btn')).toHaveTextContent(
      'Install postgresql support',
    );
  });

  it('no config offers setup', () => {
    setup(installed, { ...ready, configExists: false });
    expect(screen.getByTestId('dbt-charts-setup-btn')).toBeInTheDocument();
  });

  it('ready renders children', () => {
    setup(installed, ready);
    expect(screen.getByText('READY')).toBeInTheDocument();
  });

  it('project without connection shows no-connection state', () => {
    setup(installed, ready, { ...project, connection: undefined });
    expect(screen.getByText('No connection')).toBeInTheDocument();
  });
});
