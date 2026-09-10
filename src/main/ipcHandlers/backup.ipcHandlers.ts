import { ipcMain, dialog, BrowserWindow } from 'electron';
import { v4 as uuidv4 } from 'uuid';
import BackupService, {
  BackupExportRequest,
  BackupImportRequest,
} from '../services/backup.service';
import { TaskManagerService } from '../services';

const handlerChannels = [
  'backup:export',
  'backup:import',
  'backup:import:select',
  'backup:import:result',
] as const;

const removeBackupIpcHandlers = () => {
  handlerChannels.forEach((channel) => {
    ipcMain.removeHandler(channel);
  });
};

const registerBackupHandlers = (mainWindow: BrowserWindow) => {
  removeBackupIpcHandlers();

  /**
   * Export a backup ZIP.
   * Opens a save dialog, then runs the export as a background Task Manager task.
   * Returns { canceled, filePath, taskId } immediately.
   * The renderer subscribes to task:event to track progress.
   */
  ipcMain.handle(
    'backup:export',
    async (
      _event,
      {
        categories,
        password,
      }: Pick<BackupExportRequest, 'categories' | 'password'>,
    ) => {
      const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Backup',
        defaultPath: `dbt-studio-backup-${new Date()
          .toISOString()
          .slice(0, 10)}.zip`,
        filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
        buttonLabel: 'Export',
      });

      if (canceled || !filePath) {
        return { canceled: true };
      }

      const taskId = uuidv4();
      const abortController = new AbortController();

      TaskManagerService.create({
        id: taskId,
        type: 'backup-export',
        label: `Exporting backup to ${filePath.split('/').pop()}`,
        cancellable: true,
      });

      TaskManagerService.registerCanceller(taskId, () => {
        abortController.abort();
      });

      // Fire-and-forget — caller gets taskId immediately
      BackupService.exportBackup({
        categories,
        password,
        outputPath: filePath,
        signal: abortController.signal,
        onProgress: (loaded, total) => {
          if (abortController.signal.aborted) return;
          const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
          TaskManagerService.updateProgress(taskId, {
            loaded,
            total,
            percentage,
          });
        },
      })
        .then(() => {
          if (!abortController.signal.aborted) {
            TaskManagerService.complete(taskId);
          }
          return undefined;
        })
        .catch((err: unknown) => {
          if (abortController.signal.aborted) return;
          TaskManagerService.fail(
            taskId,
            err instanceof Error ? err.message : String(err),
          );
        });

      return { canceled: false, filePath, taskId };
    },
  );

  /**
   * Select a backup ZIP file for import.
   * Opens an open dialog and returns the selected file path.
   */
  ipcMain.handle('backup:import:select', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Backup',
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
      properties: ['openFile'],
      buttonLabel: 'Select',
    });

    if (canceled || !filePaths[0]) {
      return { canceled: true, filePath: null };
    }

    return { canceled: false, filePath: filePaths[0] };
  });

  /**
   * Import a backup ZIP.
   * Runs the import as a background Task Manager task.
   * Returns { taskId } immediately.
   * On task:event complete the renderer can call backup:import:result to fetch the summary.
   */
  ipcMain.handle(
    'backup:import',
    async (
      _event,
      {
        filePath,
        password,
      }: Pick<BackupImportRequest, 'filePath' | 'password'>,
    ) => {
      const taskId = uuidv4();

      TaskManagerService.create({
        id: taskId,
        type: 'backup-import',
        label: `Importing backup from ${filePath.split('/').pop()}`,
        cancellable: true,
      });

      let isCancelled = false;

      TaskManagerService.registerCanceller(taskId, () => {
        isCancelled = true;
      });

      // Stash the result on the task record so the renderer can retrieve it
      BackupService.importBackup({
        filePath,
        password,
        onProgress: (loaded, total) => {
          if (isCancelled) {
            throw new Error('Import cancelled by user');
          }
          const percentage = total > 0 ? Math.round((loaded / total) * 100) : 0;
          TaskManagerService.updateProgress(taskId, {
            loaded,
            total,
            percentage,
          });
        },
      })
        .then((result) => {
          if (isCancelled) return undefined;
          const task = TaskManagerService.list().find((t) => t.id === taskId);
          if (task) {
            (task as any).metadata = { result, filePath };
          }
          TaskManagerService.complete(taskId);
          return undefined;
        })
        .catch((err: unknown) => {
          if (isCancelled) return;
          TaskManagerService.fail(
            taskId,
            err instanceof Error ? err.message : String(err),
          );
        });

      return { canceled: false, taskId };
    },
  );

  /**
   * Fetch the import result OR error after the task:event marks it complete/failed.
   */
  ipcMain.handle(
    'backup:import:result',
    async (_event, { taskId }: { taskId: string }) => {
      const task = TaskManagerService.list().find((t) => t.id === taskId);
      if (!task) return null;
      const meta = (task as any).metadata ?? null;
      return {
        status: task.status,
        error: task.error ?? null,
        result: meta?.result ?? null,
        filePath: meta?.filePath ?? null,
      };
    },
  );
};

export default registerBackupHandlers;
