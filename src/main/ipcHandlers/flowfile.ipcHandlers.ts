import { ipcMain } from 'electron';
import { FlowfileChannels } from '../../types/ipc';
import { FlowfileService } from '../services/flowfile.service';

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
    return FlowfileService.install();
  });

  ipcMain.handle('flowfile:uninstall', async () => {
    return FlowfileService.uninstall();
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
