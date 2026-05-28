import type {
  AgentMemoryScope,
  WikiStatus,
  WikiLintResult,
  AgentMemoryWikiOpenResult,
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

  static async openVaultInObsidian(): Promise<AgentMemoryWikiOpenResult> {
    return window.electron.ipcRenderer.invoke('memory-wiki:open-vault');
  }

  static async openNoteInObsidian(input: {
    scopeKey?: string;
    memoryId?: number;
  }): Promise<AgentMemoryWikiOpenResult> {
    return window.electron.ipcRenderer.invoke('memory-wiki:open-note', input);
  }

  static async openSearchInObsidian(input: {
    query: string;
  }): Promise<AgentMemoryWikiOpenResult> {
    return window.electron.ipcRenderer.invoke('memory-wiki:open-search', input);
  }
}
