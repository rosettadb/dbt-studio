import { v4 as uuidv4 } from 'uuid';
import { TaskManagerService } from '../services/taskManager.service';

// Installs share one queue so only one runs at a time: dbt, its adapters,
// Flowfile and sqlglot all live in the same managed Python environment, and
// switching Python rebuilds that environment, so overlapping installs could
// leave it half-installed. Each install shows in the task manager, waiting
// ("pending") until its turn comes.
let installQueue: Promise<unknown> = Promise.resolve();

// Most install services report failure as `{ success: false }` or
// `{ ok: false }` instead of throwing.
const getReportedError = (result: unknown): string | null => {
  if (!result || typeof result !== 'object') return null;
  const { success, ok, error } = result as {
    success?: boolean;
    ok?: boolean;
    error?: string;
  };
  if (success === false || ok === false) return error || 'Install failed';
  return null;
};

export const runInstallTask = <T>(
  type: string,
  label: string,
  work: () => Promise<T>,
): Promise<T> => {
  const taskId = uuidv4();
  TaskManagerService.create({ id: taskId, type, label, status: 'pending' });

  const run = installQueue.then(async () => {
    TaskManagerService.start(taskId);
    try {
      const result = await work();
      const reportedError = getReportedError(result);
      if (reportedError) {
        TaskManagerService.fail(taskId, reportedError);
      } else {
        TaskManagerService.complete(taskId);
      }
      return result;
    } catch (error) {
      TaskManagerService.fail(
        taskId,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  });
  installQueue = run.catch(() => undefined);
  return run;
};
