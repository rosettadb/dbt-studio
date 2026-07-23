import { ipcMain, BrowserWindow } from 'electron';
import type { CancelTaskRequest, RemoveTaskRequest } from '../../types/ipc';
import { TaskManagerService } from '../services';

const handlerChannels = ['task:list', 'task:cancel', 'task:remove'];

const removeTaskManagerIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerTaskManagerHandlers = (mainWindow: BrowserWindow) => {
  removeTaskManagerIpcHandlers();

  TaskManagerService.setWindow(mainWindow);

  ipcMain.handle('task:list', async () => {
    return TaskManagerService.list();
  });

  ipcMain.handle(
    'task:cancel',
    async (_event, { taskId }: CancelTaskRequest) => {
      const success = TaskManagerService.cancel(taskId);
      return { success };
    },
  );

  ipcMain.handle(
    'task:remove',
    async (_event, { taskId }: RemoveTaskRequest) => {
      TaskManagerService.remove(taskId);
      return { success: true };
    },
  );
};

export default registerTaskManagerHandlers;
