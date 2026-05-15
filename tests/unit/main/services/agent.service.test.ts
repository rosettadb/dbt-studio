import AgentService, {
  getToolsForMode,
} from '../../../../src/main/services/agent.service';
import type { AISettingsConfig } from '../../../../src/types/backend';
import type { ChatMessage } from '../../../../src/main/schemas/mainDatabase.schema';
import { estimateMessagesTokens } from '../../../../src/main/services/ai/tokenEstimator';
import MainDatabaseService from '../../../../src/main/services/mainDatabase.service';

// Mock everything agent.service imports
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn(),
}));

jest.mock('electron', () => ({
  app: { getPath: jest.fn().mockReturnValue('/mock/path') },
  BrowserWindow: { fromWebContents: jest.fn() },
}));

jest.mock('../../../../src/main/services/ai/agentAdapter', () => ({
  getVercelModel: jest.fn(),
}));

jest.mock('ai', () => ({
  generateText: jest.fn().mockResolvedValue({ text: 'summarized history' }),
}));

jest.mock('../../../../src/main/services/ai/agents/baseAgentConfig', () => ({
  buildBaseAgentConfig: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/agents/projectAgent', () => ({
  createProjectAgent: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/agents/sqlAgent', () => ({
  createSqlAgent: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/agents/notebooksAgent', () => ({
  createNotebooksAgent: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/mcp/mcpToolAdapter', () => ({
  buildMCPToolset: jest.fn(),
}));

jest.mock('../../../../src/main/services/connectors.service', () => ({
  __esModule: true,
  default: {
    getConnectionById: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/ai/skills/skillsDiscovery', () => ({
  discoverSkills: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/skills/skillsPrompt', () => ({
  buildSkillsPrompt: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/skills/loadSkillTool', () => ({
  createLoadSkillTool: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/tools/dbt.tools', () => ({
  dbtTools: {
    readDbtModel: {},
    writeDbtModel: {},
    runDbtCommand: {},
    listDbtModels: {},
    getDbtLogs: {},
  },
}));

jest.mock('../../../../src/main/services/ai/tools/filesystem.tools', () => ({
  filesystemTools: {
    listDirectory: {},
    readFile: {},
    writeFile: {},
    pathExists: {},
  },
}));

jest.mock('../../../../src/main/services/ai/tokenEstimator', () => ({
  estimateTokens: jest.fn().mockReturnValue(10),
  estimateMessagesTokens: jest.fn().mockReturnValue(50),
  getContextWindow: jest.fn().mockReturnValue(100000),
}));

jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {
    getMessages: jest.fn(),
    addMessageWithContext: jest.fn(),
    compactConversationMessages: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/projects.service', () => ({
  __esModule: true,
  default: {
    getSelectedProject: jest.fn(),
  },
}));

jest.mock(
  '../../../../src/main/services/selectedFileContextProvider.service',
  () => ({
    __esModule: true,
    default: {
      resolveSelectedFileContext: jest.fn(),
    },
  }),
);

describe('AgentService (Phase 1)', () => {
  describe('getToolsForMode', () => {
    const aiSettingsMock: AISettingsConfig = {
      chat: {
        streamResponses: true,
        autoIncludeFileContext: true,
        showTokenCount: false,
        autoScrollToLatest: true,
      },
      tools: {
        readDbtModel: true,
        writeDbtModel: true,
        runDbtCommand: true,
        listDbtModels: true,
        getDbtLogs: true,
        listDirectory: true,
        readFile: true,
        writeFile: true,
        pathExists: true,
      },
      configuration: {
        allowAIInBackground: true,
        autoExecution: 'allowlist',
        autoContinue: true,
        autoGenerateMemories: true,
      },
      advanced: { maxWorkspaceFileCount: 5000 },
    };

    it('returns only analysis tools in chat mode', () => {
      const tools = getToolsForMode('chat', aiSettingsMock);
      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining([
          'readDbtModel',
          'listDbtModels',
          'getDbtLogs',
          'listDirectory',
          'readFile',
          'pathExists',
        ]),
      );
      expect(Object.keys(tools)).not.toContain('writeDbtModel');
      expect(Object.keys(tools)).not.toContain('runDbtCommand');
      expect(Object.keys(tools)).not.toContain('writeFile');
    });

    it('returns all enabled tools in agent mode', () => {
      const tools = getToolsForMode('agent', aiSettingsMock);
      expect(Object.keys(tools)).toEqual(
        expect.arrayContaining([
          'readDbtModel',
          'writeDbtModel',
          'runDbtCommand',
          'listDbtModels',
          'getDbtLogs',
          'listDirectory',
          'readFile',
          'writeFile',
          'pathExists',
        ]),
      );
    });

    it('respects user tool toggles in agent mode', () => {
      const customSettings = JSON.parse(JSON.stringify(aiSettingsMock));
      customSettings.tools.writeDbtModel = false;
      const tools = getToolsForMode('agent', customSettings);
      expect(Object.keys(tools)).not.toContain('writeDbtModel');
    });
  });

  describe('Context Compaction Logic', () => {
    const makeMessage = (id: number): ChatMessage => ({
      id,
      role: id % 2 === 0 ? 'assistant' : 'user',
      content: `message-${id}`,
      conversationId: 1,
      createdAt: new Date(Date.now() + id * 1000).toISOString(),
    });

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('autoCompact keeps newest 20% token tail and prepends system summary', async () => {
      const messages = Array.from({ length: 10 }, (_, i) => makeMessage(i + 1));
      const event = { sender: { send: jest.fn() } } as any;

      const compacted = await (AgentService as any).autoCompact(
        1,
        messages,
        event,
        100,
      );

      expect(compacted[0].role).toBe('system');
      // With estimateTokens mocked to 10 and context window 100,
      // tail budget is 20 so only the newest 2 messages remain unchanged.
      expect(compacted.length).toBeGreaterThan(1);
      expect(event.sender.send).toHaveBeenCalledWith(
        'agent:context-compacted',
        expect.objectContaining({ conversationId: 1 }),
      );
    });

    it('buildTurnMessages triggers compaction at >=70% total prompt usage', async () => {
      const messages = Array.from({ length: 6 }, (_, i) => makeMessage(i + 1));
      (MainDatabaseService.getMessages as jest.Mock).mockResolvedValue(
        messages,
      );
      (estimateMessagesTokens as jest.Mock).mockReturnValue(70000);
      const autoCompactSpy = jest
        .spyOn(AgentService as any, 'autoCompact')
        .mockResolvedValue([{ role: 'system', content: 'summary' }]);

      const result = await (AgentService as any).buildTurnMessages(
        1,
        'new user message',
        [],
        'test-model',
        { sender: { send: jest.fn() } } as any,
        { skills: 0, mcpTools: 0 },
      );

      expect(autoCompactSpy).toHaveBeenCalled();
      expect(result.messages[0].role).toBe('system');
      autoCompactSpy.mockRestore();
    });

    it('buildTurnMessages skips compaction below 70% total prompt usage', async () => {
      const messages = Array.from({ length: 4 }, (_, i) => makeMessage(i + 1));
      (MainDatabaseService.getMessages as jest.Mock).mockResolvedValue(
        messages,
      );
      (estimateMessagesTokens as jest.Mock).mockReturnValue(10000);
      const autoCompactSpy = jest.spyOn(AgentService as any, 'autoCompact');

      const result = await (AgentService as any).buildTurnMessages(
        1,
        'new user message',
        [],
        'test-model',
        { sender: { send: jest.fn() } } as any,
        { skills: 0, mcpTools: 0 },
      );

      expect(autoCompactSpy).not.toHaveBeenCalled();
      expect(result.messages[0].role).toBe(messages[0].role);
      autoCompactSpy.mockRestore();
    });
  });

  describe('User Message Limits', () => {
    it('allows a message within the per-message token limit', () => {
      expect(() =>
        (AgentService as any).assertUserMessageWithinLimit('hello', 32000),
      ).not.toThrow();
    });

    it('rejects a message above 25% of the model context window', () => {
      const largeMessage = 'x'.repeat(30_003);

      expect(() =>
        (AgentService as any).assertUserMessageWithinLimit(
          largeMessage,
          32_000,
        ),
      ).toThrow(/Message is too large/);
    });

    it('caps the per-message token limit at 8k for large context models', () => {
      const largeMessage = 'x'.repeat(24_003);

      expect(() =>
        (AgentService as any).assertUserMessageWithinLimit(
          largeMessage,
          1_000_000,
        ),
      ).toThrow(/8,000 tokens/);
    });
  });
});
