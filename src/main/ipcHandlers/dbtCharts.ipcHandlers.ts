import { ipcMain } from 'electron';
import { DbtChartsChannels } from '../../types/ipc';
import { DbtChartsService } from '../services/dbtCharts.service';
import { runInstallTask } from '../utils/installTask';
import { installDbtChartsWebviewGuard } from '../utils/dbtChartsWebview';
import { installServerQuitHook } from '../utils/dbtChartsServer';
import {
  DBT_CHARTS_INSTALL_TASK,
  DBT_CHARTS_VERSION,
} from '../../shared/dbtCharts';

const handlerChannels: DbtChartsChannels[] = [
  'dbt-charts:getStatus',
  'dbt-charts:install',
  'dbt-charts:getProjectState',
  'dbt-charts:ensureServer',
  'dbt-charts:stopServer',
  'dbt-charts:restartServer',
  'dbt-charts:getServerStatus',
  'dbt-charts:getServerLog',
  'dbt-charts:clearServerLog',
  'dbt-charts:validate',
  'dbt-charts:runParse',
];

const removeDbtChartsHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
};

const registerDbtChartsHandlers = () => {
  removeDbtChartsHandlers();
  installDbtChartsWebviewGuard();
  installServerQuitHook();

  ipcMain.handle('dbt-charts:getStatus', async () =>
    DbtChartsService.getStatus(),
  );

  ipcMain.handle(
    'dbt-charts:install',
    async (_event, body: { projectPath?: string }) =>
      runInstallTask(
        DBT_CHARTS_INSTALL_TASK,
        'Installing dbt Charts',
        (control) =>
          DbtChartsService.install({
            projectPath: body?.projectPath,
            signal: control.signal,
            markUnsafeToStop: control.markUnsafeToStop,
          }),
        { subject: `dbt-charts@${DBT_CHARTS_VERSION}`, stoppable: true },
      ),
  );

  ipcMain.handle(
    'dbt-charts:getProjectState',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.getProjectState(body.projectPath),
  );

  ipcMain.handle(
    'dbt-charts:ensureServer',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.ensureServer(body.projectPath),
  );

  ipcMain.handle(
    'dbt-charts:stopServer',
    async (_event, body?: { force?: boolean }) =>
      DbtChartsService.stopServer({ force: body?.force }),
  );

  ipcMain.handle(
    'dbt-charts:restartServer',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.restartServer(body.projectPath),
  );

  ipcMain.handle(
    'dbt-charts:getServerLog',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.getServerLog(body.projectPath),
  );

  ipcMain.handle('dbt-charts:clearServerLog', async () =>
    DbtChartsService.clearServerLog(),
  );

  ipcMain.handle(
    'dbt-charts:getServerStatus',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.getServerStatus(body.projectPath),
  );

  ipcMain.handle(
    'dbt-charts:validate',
    async (_event, body: { projectPath: string; filePath: string }) =>
      DbtChartsService.validate(body),
  );

  ipcMain.handle(
    'dbt-charts:runParse',
    async (_event, body: { projectPath: string }) =>
      DbtChartsService.runParse(body.projectPath),
  );
};

export default registerDbtChartsHandlers;
