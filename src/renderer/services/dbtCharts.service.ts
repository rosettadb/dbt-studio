import { client } from '../config/client';
import type {
  ChartsInstallLine,
  ChartsParseResult,
  ChartsServerLogEvent,
  ChartsServerStatus,
  ChartsValidationResult,
  DbtChartsStatus,
  ProjectChartsState,
} from '../../shared/dbtCharts';

type Unsubscribe = () => void;

export const getDbtChartsStatus = async (): Promise<DbtChartsStatus> => {
  const { data } = await client.get<DbtChartsStatus>('dbt-charts:getStatus');
  return data;
};

export const installDbtCharts = async (
  projectPath?: string,
): Promise<DbtChartsStatus> => {
  const { data } = await client.post<{ projectPath?: string }, DbtChartsStatus>(
    'dbt-charts:install',
    { projectPath },
  );
  return data;
};

export const getProjectChartsState = async (
  projectPath: string,
): Promise<ProjectChartsState> => {
  const { data } = await client.post<
    { projectPath: string },
    ProjectChartsState
  >('dbt-charts:getProjectState', { projectPath });
  return data;
};

export const ensureChartsServer = async (
  projectPath: string,
): Promise<ChartsServerStatus> => {
  const { data } = await client.post<
    { projectPath: string },
    ChartsServerStatus
  >('dbt-charts:ensureServer', { projectPath });
  return data;
};

/** Stops the board server; board tabs then wait for Start. */
export const stopChartsServer = async (force = false): Promise<void> => {
  await client.post<{ force: boolean }, void>('dbt-charts:stopServer', {
    force,
  });
};

export const restartChartsServer = async (
  projectPath: string,
): Promise<ChartsServerStatus> => {
  const { data } = await client.post<
    { projectPath: string },
    ChartsServerStatus
  >('dbt-charts:restartServer', { projectPath });
  return data;
};

export const getChartsServerLog = async (
  projectPath: string,
): Promise<string[]> => {
  const { data } = await client.post<{ projectPath: string }, string[]>(
    'dbt-charts:getServerLog',
    { projectPath },
  );
  return data;
};

export const clearChartsServerLog = async (): Promise<void> => {
  await client.get('dbt-charts:clearServerLog');
};

export const getChartsServerStatus = async (
  projectPath: string,
): Promise<ChartsServerStatus> => {
  const { data } = await client.post<
    { projectPath: string },
    ChartsServerStatus
  >('dbt-charts:getServerStatus', { projectPath });
  return data;
};

export const validateChartsFile = async (
  projectPath: string,
  filePath: string,
): Promise<ChartsValidationResult> => {
  const { data } = await client.post<
    { projectPath: string; filePath: string },
    ChartsValidationResult
  >('dbt-charts:validate', { projectPath, filePath });
  return data;
};

export const runChartsDbtParse = async (
  projectPath: string,
): Promise<ChartsParseResult> => {
  const { data } = await client.post<
    { projectPath: string },
    ChartsParseResult
  >('dbt-charts:runParse', { projectPath });
  return data;
};

export const subscribeToChartsServerStatus = (
  handler: (status: ChartsServerStatus) => void,
): Unsubscribe =>
  window.electron.ipcRenderer.on('dbt-charts:serverStatus', (...args) =>
    handler(args[0] as ChartsServerStatus),
  );

export const subscribeToChartsServerLog = (
  handler: (event: ChartsServerLogEvent) => void,
): Unsubscribe =>
  window.electron.ipcRenderer.on('dbt-charts:serverLog', (...args) =>
    handler(args[0] as ChartsServerLogEvent),
  );

export const subscribeToChartsInstallLine = (
  handler: (event: ChartsInstallLine) => void,
): Unsubscribe =>
  window.electron.ipcRenderer.on('dbt-charts:installLine', (...args) =>
    handler(args[0] as ChartsInstallLine),
  );
