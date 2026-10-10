import { ipcMain } from 'electron';
import { DbtChartsChannels } from '../../types/ipc';
import type {
  DbtChartsCreateBoardInput,
  DbtChartsValidateInput,
} from '../../types/backend';
import { dlog } from '../../shared/dbtChartsDebug'; // DBT-CHARTS-DEBUG
import DbtChartsService from '../services/dbtCharts.service';

const handlerChannels: DbtChartsChannels[] = [
  'dbt-charts:getStatus',
  'dbt-charts:install',
  'dbt-charts:uninstall',
  'dbt-charts:getProjectState',
  'dbt-charts:setupProject',
  'dbt-charts:createBoard',
  'dbt-charts:ensureManifest',
  'dbt-charts:validate',
  'dbt-charts:startServer',
  'dbt-charts:stopServer',
  'dbt-charts:getServerStatus',
];

const registerDbtChartsHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
  handlerChannels.forEach((channel) =>
    dlog('main:ipc', `registered ${channel}`),
  ); // DBT-CHARTS-DEBUG
  const rawHandle = ipcMain.handle.bind(ipcMain); // DBT-CHARTS-DEBUG
  ipcMain.handle = ((channel: string, listener: (...a: any[]) => unknown) =>
    rawHandle(channel, (e: any, ...a: any[]) => {
      dlog('main:ipc', `<- ${channel}`, a);
      return listener(e, ...a);
    })) as typeof ipcMain.handle; // DBT-CHARTS-DEBUG

  ipcMain.handle('dbt-charts:getStatus', () => DbtChartsService.getStatus());
  ipcMain.handle('dbt-charts:install', () => DbtChartsService.install());
  ipcMain.handle('dbt-charts:uninstall', () => DbtChartsService.uninstall());
  ipcMain.handle('dbt-charts:getProjectState', (_e, projectId: string) =>
    DbtChartsService.getProjectState(projectId),
  );
  ipcMain.handle('dbt-charts:setupProject', (_e, projectId: string) =>
    DbtChartsService.setupProject(projectId),
  );
  ipcMain.handle(
    'dbt-charts:createBoard',
    (_e, input: DbtChartsCreateBoardInput) =>
      DbtChartsService.createBoard(input),
  );
  ipcMain.handle('dbt-charts:ensureManifest', (_e, projectId: string) =>
    DbtChartsService.ensureManifest(projectId),
  );
  ipcMain.handle('dbt-charts:validate', (_e, input: DbtChartsValidateInput) =>
    DbtChartsService.validate(input),
  );
  ipcMain.handle('dbt-charts:startServer', (_e, projectId: string) =>
    DbtChartsService.startServer(projectId),
  );
  ipcMain.handle('dbt-charts:stopServer', (_e, projectId: string) =>
    DbtChartsService.stopServer(projectId),
  );
  ipcMain.handle('dbt-charts:getServerStatus', (_e, projectId: string) =>
    DbtChartsService.getServerStatus(projectId),
  );
  ipcMain.handle = rawHandle as typeof ipcMain.handle; // DBT-CHARTS-DEBUG
};

export default registerDbtChartsHandlers;
