import type {
  AgentMemoryScope,
  WikiStatus,
  WikiLintResult,
} from '../../types/backend';

export default class AgentMemoryWikiService {
  static async getStatus(): Promise<WikiStatus> {
    return window.electron.ipcRenderer.invoke('memory-wiki:status');
  }

  static async compilePending(): Promise<{ compiledScopes: number }> {
    return window.electron.ipcRenderer.invoke('memory-wiki:compile');
  }

  static async lintScope(scope: AgentMemoryScope): Promise<WikiLintResult> {
    return window.electron.ipcRenderer.invoke('memory-wiki:lint', scope);
  }
}
