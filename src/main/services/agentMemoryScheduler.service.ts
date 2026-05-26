import type { AgentMemoryDreamingRunNowResult } from '../../types/backend';

export default class AgentMemorySchedulerService {
  static async runNow(): Promise<AgentMemoryDreamingRunNowResult> {
    return {
      ok: false,
      notImplemented: true,
      message: 'Agent memory dreaming is not implemented yet.',
    };
  }
}
