import { client as rawClient } from '../config/client';
import { dlog } from '../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG
import type {
  DbtChartsCreateBoardInput,
  DbtChartsDiagnostic,
  DbtChartsInstallProgress,
  DbtChartsManifestResult,
  DbtChartsProjectState,
  DbtChartsResult,
  DbtChartsServerEvent,
  DbtChartsServerStatus,
  DbtChartsSetupResult,
  DbtChartsStatus,
  DbtChartsValidateInput,
} from '../../types/backend';

// DBT-CHARTS-DEBUG: trace every IPC round trip from the renderer.
const client = {
  get: async <R = void>(channel: Parameters<typeof rawClient.get>[0]) => {
    dlog('renderer:service', `-> ${channel}`);
    try {
      const res = await rawClient.get<R>(channel);
      dlog('renderer:service', `<- ${channel}`, res.data);
      return res;
    } catch (e) {
      dlog(
        'renderer:service',
        `!! ${channel} FAILED`,
        (e as Error)?.message ?? e,
      );
      throw e;
    }
  },
  post: async <T = undefined, R = void>(
    channel: Parameters<typeof rawClient.post>[0],
    body: T,
  ) => {
    dlog('renderer:service', `-> ${channel}`, body);
    try {
      const res = await rawClient.post<T, R>(channel, body);
      dlog('renderer:service', `<- ${channel}`, res.data);
      return res;
    } catch (e) {
      dlog(
        'renderer:service',
        `!! ${channel} FAILED`,
        (e as Error)?.message ?? e,
      );
      throw e;
    }
  },
};

export const dbtChartsGetStatus = async (): Promise<DbtChartsStatus> => {
  const { data } = await client.get<DbtChartsStatus>('dbt-charts:getStatus');
  return data;
};

export const dbtChartsInstall = async (): Promise<DbtChartsResult> => {
  const { data } = await client.get<DbtChartsResult>('dbt-charts:install');
  return data;
};

export const dbtChartsUninstall = async (): Promise<{ ok: boolean }> => {
  const { data } = await client.get<{ ok: boolean }>('dbt-charts:uninstall');
  return data;
};

export const dbtChartsGetProjectState = async (
  projectId: string,
): Promise<DbtChartsProjectState> => {
  const { data } = await client.post<string, DbtChartsProjectState>(
    'dbt-charts:getProjectState',
    projectId,
  );
  return data;
};

export const dbtChartsSetupProject = async (
  projectId: string,
): Promise<DbtChartsSetupResult> => {
  const { data } = await client.post<string, DbtChartsSetupResult>(
    'dbt-charts:setupProject',
    projectId,
  );
  return data;
};

export const dbtChartsCreateBoard = async (
  input: DbtChartsCreateBoardInput,
): Promise<{ path: string }> => {
  const { data } = await client.post<
    DbtChartsCreateBoardInput,
    { path: string }
  >('dbt-charts:createBoard', input);
  return data;
};

export const dbtChartsEnsureManifest = async (
  projectId: string,
): Promise<DbtChartsManifestResult> => {
  const { data } = await client.post<string, DbtChartsManifestResult>(
    'dbt-charts:ensureManifest',
    projectId,
  );
  return data;
};

export const dbtChartsValidate = async (
  input: DbtChartsValidateInput,
): Promise<DbtChartsDiagnostic[]> => {
  const { data } = await client.post<
    DbtChartsValidateInput,
    DbtChartsDiagnostic[]
  >('dbt-charts:validate', input);
  return data;
};

export const dbtChartsStartServer = async (
  projectId: string,
): Promise<{ url: string; port: number }> => {
  const { data } = await client.post<string, { url: string; port: number }>(
    'dbt-charts:startServer',
    projectId,
  );
  return data;
};

export const dbtChartsStopServer = async (projectId: string): Promise<void> => {
  await client.post<string, void>('dbt-charts:stopServer', projectId);
};

export const dbtChartsGetServerStatus = async (
  projectId: string,
): Promise<DbtChartsServerStatus> => {
  const { data } = await client.post<string, DbtChartsServerStatus>(
    'dbt-charts:getServerStatus',
    projectId,
  );
  return data;
};

/** Subscribe to install progress. Returns an unsubscribe function. */
export const onDbtChartsInstallProgress = (
  handler: (event: DbtChartsInstallProgress) => void,
): (() => void) =>
  window.electron.ipcRenderer.on('dbt-charts:installProgress', (...args) => {
    dlog('renderer:event', 'installProgress', args[0]); // DBT-CHARTS-DEBUG
    handler(args[0] as DbtChartsInstallProgress);
  });

/** Subscribe to server lifecycle events (all projects). Returns an unsubscribe function. */
export const onDbtChartsServerStatus = (
  handler: (event: DbtChartsServerEvent) => void,
): (() => void) =>
  window.electron.ipcRenderer.on('dbt-charts:serverStatus', (...args) => {
    dlog('renderer:event', 'serverStatus', args[0]); // DBT-CHARTS-DEBUG
    handler(args[0] as DbtChartsServerEvent);
  });
