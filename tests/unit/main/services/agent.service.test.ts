import AgentService, {
  AI_SETTINGS_DEFAULTS,
  getToolFailureMessage,
  getToolsForMode,
  normalizeAISettings,
  sanitizeWikiToolCallForPersistence,
} from '../../../../src/main/services/agent.service';
import type { AISettingsConfig } from '../../../../src/types/backend';
import type { ChatMessage } from '../../../../src/main/schemas/mainDatabase.schema';
import { estimateMessagesTokens } from '../../../../src/main/services/ai/tokenEstimator';
import MainDatabaseService from '../../../../src/main/services/mainDatabase.service';
import { getVercelModel } from '../../../../src/main/services/ai/agentAdapter';

// Mock everything agent.service imports
jest.mock('fs-extra', () => ({
  existsSync: jest.fn(),
  readJson: jest.fn(),
  writeJson: jest.fn(),
}));

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
    getName: jest.fn().mockReturnValue('dbt-studio-test'),
    getVersion: jest.fn().mockReturnValue('0.0.0-test'),
  },
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

jest.mock('../../../../src/main/services/ai/agents/analyticsAgent', () => ({
  createAnalyticsAgent: jest.fn(),
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

jest.mock(
  '../../../../src/main/services/ai/tools/studio/pipeline.tools',
  () => ({
    PROJECT_PIPELINE_TOOL_NAMES: {
      studio_pipeline_list: true,
      studio_pipeline_read: true,
      studio_pipeline_generate: true,
      studio_pipeline_update: true,
    },
    buildProjectPipelineContext: jest
      .fn()
      .mockResolvedValue('## Project Pipelines\n\n- Existing pipelines: none'),
  }),
);

jest.mock('../../../../src/main/services/ai/tokenEstimator', () => ({
  estimateTokens: jest.fn().mockReturnValue(10),
  estimateMessagesTokens: jest.fn().mockReturnValue(50),
  getContextWindow: jest.fn().mockReturnValue(100000),
}));

jest.mock('../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: {
    getMessages: jest.fn(),
    getMessagesWithContext: jest.fn(),
    getLatestCompactionSummary: jest.fn().mockResolvedValue(null),
    saveCompactionSummary: jest.fn(),
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
  describe('AI settings migration', () => {
    it('adds disabled Second Brain defaults to legacy settings', () => {
      const normalized = normalizeAISettings({
        configuration: { autoGenerateMemories: true },
      });

      expect(normalized.secondBrain).toEqual(AI_SETTINGS_DEFAULTS.secondBrain);
      expect(normalized.secondBrain.enabled).toBe(false);
      expect(normalized.configuration.autoGenerateMemories).toBe(true);
    });

    it('clamps Second Brain byte and prompt budgets', () => {
      const normalized = normalizeAISettings({
        secondBrain: {
          enabled: true,
          maxPromptChars: Number.POSITIVE_INFINITY,
          maxPageBytes: 100,
          maxTotalBytes: 500,
        },
      });

      expect(normalized.secondBrain.enabled).toBe(true);
      expect(normalized.secondBrain.maxPromptChars).toBe(6000);
      expect(normalized.secondBrain.maxPageBytes).toBe(1024);
      expect(normalized.secondBrain.maxTotalBytes).toBe(1024);
    });
  });

  describe('Second Brain persistence redaction', () => {
    it('omits wiki page bodies and update content from persisted tool metadata', () => {
      const read = sanitizeWikiToolCallForPersistence(
        'wiki_read',
        { pageId: 'MEMORY.md' },
        {
          ok: true,
          pageId: 'MEMORY.md',
          title: 'Second Brain',
          body: 'private durable page body',
          hash: 'a'.repeat(64),
        },
      );
      const update = sanitizeWikiToolCallForPersistence(
        'wiki_update',
        {
          pageId: 'MEMORY.md',
          rationale: 'private rationale',
          sourceRefs: ['private source reference'],
          operation: {
            type: 'create',
            heading: 'private heading',
            searchQuery: 'private search query',
            content: 'new private fact',
          },
        },
        { ok: true },
      );
      const archive = sanitizeWikiToolCallForPersistence(
        'wiki_archive',
        {
          pageId: 'topics/private.md',
          expectedHash: 'a'.repeat(64),
          rationale: 'private archive rationale',
        },
        { ok: true },
      );

      expect(read.output).toMatchObject({
        bodyOmitted: true,
        bodyChars: 25,
      });
      expect(JSON.stringify(read.output)).not.toContain('private durable');
      expect(update.input).toMatchObject({
        operation: {
          contentOmitted: true,
          contentChars: 16,
          headingOmitted: true,
          searchQueryOmitted: true,
        },
        sourceRefsCount: 1,
        sourceRefsOmitted: true,
        rationaleOmitted: true,
      });
      expect(JSON.stringify(update.input)).not.toContain('new private fact');
      expect(JSON.stringify(update.input)).not.toContain('private heading');
      expect(JSON.stringify(update.input)).not.toContain(
        'private search query',
      );
      expect(JSON.stringify(update.input)).not.toContain('private source');
      expect(JSON.stringify(update.input)).not.toContain('private rationale');
      expect(archive.input).toMatchObject({
        pageId: 'topics/private.md',
        rationaleChars: 25,
        rationaleOmitted: true,
      });
      expect(JSON.stringify(archive.input)).not.toContain(
        'private archive rationale',
      );
    });
  });

  describe('Tool terminal states', () => {
    it('recognizes structured tool failures as errors', () => {
      expect(
        getToolFailureMessage({
          ok: false,
          error: { code: 'OUT_OF_SCOPE', message: 'Page is out of scope.' },
        }),
      ).toBe('Page is out of scope.');
      expect(getToolFailureMessage({ ok: true })).toBeUndefined();
    });
  });

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
        studio_pipeline_list: true,
        studio_pipeline_read: true,
        studio_pipeline_generate: true,
        studio_pipeline_update: true,
      },
      configuration: {
        allowAIInBackground: true,
        autoExecution: 'allowlist',
        autoContinue: true,
        autoGenerateMemories: true,
      },
      advanced: { maxWorkspaceFileCount: 5000 },
      secondBrain: {
        enabled: false,
        initialized: false,
        maxPromptChars: 6000,
        maxPageBytes: 64 * 1024,
        maxTotalBytes: 10 * 1024 * 1024,
        includeGlobalPages: true,
        inlineSelfLearning: true,
      },
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
          'studio_pipeline_list',
          'studio_pipeline_read',
        ]),
      );
      expect(Object.keys(tools)).not.toContain('writeDbtModel');
      expect(Object.keys(tools)).not.toContain('runDbtCommand');
      expect(Object.keys(tools)).not.toContain('writeFile');
      expect(Object.keys(tools)).not.toContain('studio_pipeline_generate');
      expect(Object.keys(tools)).not.toContain('studio_pipeline_update');
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
          'studio_pipeline_list',
          'studio_pipeline_read',
          'studio_pipeline_generate',
          'studio_pipeline_update',
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
        null,
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
      (
        MainDatabaseService.getMessagesWithContext as jest.Mock
      ).mockResolvedValue(messages);
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
      (
        MainDatabaseService.getMessagesWithContext as jest.Mock
      ).mockResolvedValue(messages);
      (estimateMessagesTokens as jest.Mock).mockReturnValue(10000);
      const autoCompactSpy = jest.spyOn(AgentService as any, 'autoCompact');

      const result = await (AgentService as any).buildTurnMessages(
        1,
        'new user message',
        [],
        'test-model',
        { sender: { send: jest.fn() } } as any,
        { skills: 0, mcpTools: 0, secondBrain: 200 },
      );

      expect(autoCompactSpy).not.toHaveBeenCalled();
      expect(result.messages[0].role).toBe(messages[0].role);
      expect(result.breakdown.secondBrain).toBe(200);
      expect(result.breakdown.total).toBe(10_220);
      autoCompactSpy.mockRestore();
    });
  });

  describe('Resumed session context overhead', () => {
    it('returns fixed prompt categories without running an agent turn', async () => {
      (getVercelModel as jest.Mock).mockResolvedValue({
        modelId: 'gemini-3.1-flash-lite',
      });
      const overheadSpy = jest
        .spyOn(AgentService as any, 'buildFixedPromptContext')
        .mockResolvedValue({
          secondBrainContext: 'memory context',
          secondBrainTools: {},
          fixedOverheadTokens: {
            skills: 595,
            mcpTools: 0,
            secondBrain: 401,
          },
        });

      await expect(
        AgentService.getContextOverhead({
          conversationId: 7,
          projectPath: '/project',
          screenKey: 'project',
          toolMode: 'agent',
        }),
      ).resolves.toEqual({
        skills: 595,
        mcpTools: 0,
        secondBrain: 401,
        contextWindow: 100_000,
      });

      overheadSpy.mockRestore();
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

    it('applies the 20k character cap before token limits', () => {
      const largeMessage = 'x'.repeat(24_003);

      expect(() =>
        (AgentService as any).assertUserMessageWithinLimit(
          largeMessage,
          1_000_000,
        ),
      ).toThrow(/20,000 characters/);
    });
  });
});
