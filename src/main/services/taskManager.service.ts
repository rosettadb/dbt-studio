import { BrowserWindow } from 'electron';
import type { TaskEvent, TaskProgress, TaskRecord } from '../../types/ipc';

// Generic registry for long-running background tasks (downloads, uploads,
// exports, ...). Tasks run to completion in the main process regardless of
// renderer lifecycle; this service is the single source of truth renderer
// windows resync against, and the pub/sub feed (`task:event`) they subscribe
// to by the task's unique id.
const PROGRESS_THROTTLE_MS = 250;

type Canceller = () => void;

class TaskManagerServiceImpl {
  private tasks = new Map<string, TaskRecord>();

  private cancellers = new Map<string, Canceller>();

  private lastProgressEmit = new Map<string, number>();

  private window: BrowserWindow | null = null;

  setWindow(window: BrowserWindow) {
    this.window = window;
  }

  private broadcast(event: TaskEvent) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.send('task:event', event);
    }
  }

  list(): TaskRecord[] {
    return Array.from(this.tasks.values()).sort(
      (a, b) => b.startedAt - a.startedAt,
    );
  }

  create(params: {
    id: string;
    type: string;
    label: string;
    cancellable?: boolean;
  }): TaskRecord {
    const task: TaskRecord = {
      id: params.id,
      type: params.type,
      label: params.label,
      status: 'running',
      startedAt: Date.now(),
      cancellable: params.cancellable ?? false,
    };
    this.tasks.set(task.id, task);
    this.broadcast({ type: 'created', task });
    return task;
  }

  updateProgress(id: string, progress: TaskProgress) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.progress = progress;

    const now = Date.now();
    const last = this.lastProgressEmit.get(id) ?? 0;
    const isDone = progress.total > 0 && progress.loaded >= progress.total;
    if (!isDone && now - last < PROGRESS_THROTTLE_MS) return;
    this.lastProgressEmit.set(id, now);

    this.broadcast({ type: 'updated', task });
  }

  complete(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'completed';
    task.finishedAt = Date.now();
    this.cancellers.delete(id);
    this.lastProgressEmit.delete(id);
    this.broadcast({ type: 'updated', task });
  }

  fail(id: string, error: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    task.status = 'error';
    task.error = error;
    task.finishedAt = Date.now();
    this.cancellers.delete(id);
    this.lastProgressEmit.delete(id);
    this.broadcast({ type: 'updated', task });
  }

  registerCanceller(id: string, fn: Canceller) {
    this.cancellers.set(id, fn);
  }

  cancel(id: string): boolean {
    const task = this.tasks.get(id);
    const canceller = this.cancellers.get(id);
    if (!task || !canceller) return false;

    canceller();
    task.status = 'cancelled';
    task.finishedAt = Date.now();
    this.cancellers.delete(id);
    this.lastProgressEmit.delete(id);
    this.broadcast({ type: 'updated', task });
    return true;
  }

  remove(id: string) {
    const task = this.tasks.get(id);
    if (!task) return;
    this.tasks.delete(id);
    this.cancellers.delete(id);
    this.lastProgressEmit.delete(id);
    this.broadcast({ type: 'removed', task });
  }
}

export const TaskManagerService = new TaskManagerServiceImpl();
export default TaskManagerService;
