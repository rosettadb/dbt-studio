import { ipcMain } from 'electron';
import { FlowfileChannels } from '../../types/ipc';
import { FlowfileService } from '../services/flowfile.service';
import { runInstallTask } from '../utils/installTask';

const handlerChannels: FlowfileChannels[] = [
  'flowfile:install',
  'flowfile:uninstall',
  'flowfile:getStatus',
  'flowfile:start',
  'flowfile:stop',
];

const removeFlowfileHandlers = () => {
  handlerChannels.forEach((channel) => ipcMain.removeHandler(channel));
};

const registerFlowfileHandlers = () => {
  removeFlowfileHandlers();

  ipcMain.handle('flowfile:install', async () => {
    return runInstallTask('install:flowfile', 'Installing Flowfile', () =>
      FlowfileService.install(),
    );
  });

  ipcMain.handle('flowfile:uninstall', async () => {
    return runInstallTask('install:flowfile', 'Uninstalling Flowfile', () =>
      FlowfileService.uninstall(),
    );
  });

  ipcMain.handle('flowfile:getStatus', async () => {
    return FlowfileService.getStatus();
  });

  ipcMain.handle('flowfile:start', async () => {
    return FlowfileService.start();
  });

  ipcMain.handle('flowfile:stop', async () => {
    return FlowfileService.stop();
  });
};

export default registerFlowfileHandlers;
