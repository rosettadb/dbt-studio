import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import AgentMemoryDreamingService from './agentMemoryDreaming.service';
import type {
  AgentMemoryDreamingRun,
  AgentMemoryDreamingRunNowResult,
  AgentMemoryDreamingTrigger,
  AISettingsConfig,
} from '../../types/backend';

const AI_SETTINGS_PATH = () =>
  path.join(app.getPath('userData'), 'ai-settings.json');

const AI_MEMORY_DEFAULTS = {
  enabled: true,
  autoCapture: true,
  shortTermEnabled: true,
  dreamingEnabled: false,
  lightDreamingEnabled: true,
};

async function loadAISettingsForScheduler(): Promise<
  Pick<AISettingsConfig, 'memory'>
> {
  try {
    const fp = AI_SETTINGS_PATH();
    if (!fs.existsSync(fp)) return { memory: AI_MEMORY_DEFAULTS as any };
    const raw = await fs.readJson(fp);
    return { memory: { ...AI_MEMORY_DEFAULTS, ...raw.memory } };
  } catch {
    return { memory: AI_MEMORY_DEFAULTS as any };
  }
}

const SCHEDULE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const MISSED_RUN_THRESHOLD_MS = 20 * 60 * 60 * 1000;
const POST_TURN_DEBOUNCE_MS = 5 * 60 * 1000;

function isScheduledDreamingEnabled(
  settings: Pick<AISettingsConfig, 'memory'>,
): boolean {
  const { memory } = settings;
  return (
    memory?.enabled === true &&
    memory.dreamingEnabled === true &&
    memory.lightDreamingEnabled === true &&
    memory.shortTermEnabled === true
  );
}

function isPostTurnDreamingEnabled(
  settings: Pick<AISettingsConfig, 'memory'>,
): boolean {
  const { memory } = settings;
  return (
    memory?.enabled === true &&
    memory.lightDreamingEnabled === true &&
    memory.shortTermEnabled === true
  );
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

export default class AgentMemorySchedulerService {
  private static interval: ReturnType<typeof setInterval> | null = null;

  private static activeRun: Promise<AgentMemoryDreamingRun> | null = null;

  private static lastPostTurnSweepAt = 0;

  static async initialize(): Promise<void> {
    await this.reconcile();
  }

  static async reconcile(): Promise<void> {
    const settings = await loadAISettingsForScheduler();
    if (!isScheduledDreamingEnabled(settings)) {
      this.clearInterval();
      await AgentMemoryDreamingService.setConfigValue(
        'dreaming_next_scheduled_at',
        '',
      );
      return;
    }

    this.scheduleInterval();
    const nextScheduledAt = new Date(
      Date.now() + SCHEDULE_INTERVAL_MS,
    ).toISOString();
    await AgentMemoryDreamingService.setConfigValue(
      'dreaming_next_scheduled_at',
      nextScheduledAt,
    );

    const lastRunAt = parseTimestamp(
      await AgentMemoryDreamingService.getConfigValue('last_dreaming_run_at'),
    );
    const stale =
      lastRunAt === null || Date.now() - lastRunAt > MISSED_RUN_THRESHOLD_MS;
    if (stale) {
      // eslint-disable-next-line no-console
      console.log(
        `[AgentMemoryScheduler] Startup catch-up sweep triggered. Last run was ${lastRunAt ? new Date(lastRunAt).toISOString() : 'never'}`,
      );
      this.runSweepSafely('startup');
    }
  }

  static async runNow(): Promise<AgentMemoryDreamingRunNowResult> {
    const run = await this.runSweep('manual');
    if (run.status === 'completed') {
      return {
        ok: true,
        runId: run.id,
        message: `Memory dreaming completed for run ${run.id}.`,
      };
    }

    return {
      ok: false,
      runId: run.id,
      message: run.errorMessage ?? `Memory dreaming ended with ${run.status}.`,
    };
  }

  static async runPostTurnIfDue(
    settings?: Pick<AISettingsConfig, 'memory'>,
  ): Promise<void> {
    const resolvedSettings = settings ?? (await loadAISettingsForScheduler());
    if (!isPostTurnDreamingEnabled(resolvedSettings)) return;

    const now = Date.now();
    if (now - this.lastPostTurnSweepAt < POST_TURN_DEBOUNCE_MS) return;

    const lastRunAt = parseTimestamp(
      await AgentMemoryDreamingService.getConfigValue('last_dreaming_run_at'),
    );
    if (lastRunAt !== null && now - lastRunAt < POST_TURN_DEBOUNCE_MS) {
      return;
    }

    this.lastPostTurnSweepAt = now;
    this.runSweepSafely('post_turn');
  }

  static async shutdown(): Promise<void> {
    this.clearInterval();
    const { activeRun } = this;
    if (activeRun) {
      await activeRun.catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[AgentMemoryScheduler] shutdown wait failed:', error);
      });
    }
  }

  private static scheduleInterval(): void {
    if (this.interval) return;
    // eslint-disable-next-line no-console
    console.log(
      `[AgentMemoryScheduler] Scheduling background interval every ${SCHEDULE_INTERVAL_MS}ms`,
    );
    this.interval = setInterval(() => {
      this.runScheduledIfEnabled().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('[AgentMemoryScheduler] scheduled run failed:', error);
      });
    }, SCHEDULE_INTERVAL_MS);
  }

  private static clearInterval(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  private static async runScheduledIfEnabled(): Promise<void> {
    const settings = await loadAISettingsForScheduler();
    if (!isScheduledDreamingEnabled(settings)) {
      await this.reconcile();
      return;
    }
    await this.runSweepSafely('scheduled');
  }

  private static async runSweepSafely(
    trigger: AgentMemoryDreamingTrigger,
  ): Promise<void> {
    try {
      await this.runSweep(trigger);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AgentMemoryScheduler] sweep failed:', error);
    }
  }

  private static async runSweep(
    trigger: AgentMemoryDreamingTrigger,
  ): Promise<AgentMemoryDreamingRun> {
    if (this.activeRun) {
      return this.activeRun;
    }

    this.activeRun = AgentMemoryDreamingService.runManagedSweep(trigger);
    try {
      return await this.activeRun;
    } finally {
      this.activeRun = null;
    }
  }
}
