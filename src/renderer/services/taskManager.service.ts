import type {
  TaskRecord,
  TaskEvent,
  CancelTaskRequest,
  CancelTaskResponse,
  RemoveTaskRequest,
} from '../../types/ipc';
import { client } from '../config/client';

class TaskManagerService {
  static async list(): Promise<TaskRecord[]> {
    const { data } = await client.get<TaskRecord[]>('task:list');
    return data;
  }

  static async cancel(taskId: string): Promise<CancelTaskResponse> {
    const { data } = await client.post<CancelTaskRequest, CancelTaskResponse>(
      'task:cancel',
      { taskId },
    );
    return data;
  }

  static async remove(taskId: string): Promise<void> {
    await client.post<RemoveTaskRequest, { success: boolean }>('task:remove', {
      taskId,
    });
  }

  static onEvent(handler: (event: TaskEvent) => void): () => void {
    return window.electron.ipcRenderer.on(
      'task:event',
      handler as (...args: unknown[]) => void,
    );
  }
}

export default TaskManagerService;
