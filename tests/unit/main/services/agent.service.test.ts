import AgentService, {
  getToolsForMode,
} from '../../../../src/main/services/agent.service';
import type { AISettingsConfig } from '../../../../src/types/backend';
import type { ChatMessage } from '../../../../src/main/schemas/mainDatabase.schema';

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

jest.mock('../../../../src/main/services/ai/dbtAgent', () => ({
  createDbtAgent: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/agentAdapter', () => ({
  getVercelModel: jest.fn(),
}));

jest.mock('../../../../src/main/services/ai/mcp/mcpToolAdapter', () => ({
  buildMCPToolset: jest.fn(),
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
    getCompactionSummary: jest.fn(),
    saveCompactionSummary: jest.fn(),
  },
}));

jest.mock('../../../../src/main/services/projects.service', () => ({
  __esModule: true,
  default: {
    getSelectedProject: jest.fn(),
  },
}));

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

  describe('Token Management Logic', () => {
    it('detectConversationPhase detects debugging phase', () => {
      const messages: ChatMessage[] = [
        {
          id: 1,
          role: 'user',
          content: 'I have an error in my code',
          conversationId: 1,
          createdAt: new Date().toISOString(),
        },
      ];
      const result = (AgentService as any).detectConversationPhase(messages);
      expect(result.phase).toBe('debugging');
      expect(result.recommendedLimit).toBe(15);
    });

    it('detectConversationPhase detects implementation phase', () => {
      const messages: ChatMessage[] = [
        {
          id: 1,
          role: 'user',
          content: 'Let us write a new class',
          conversationId: 1,
          createdAt: new Date().toISOString(),
        },
      ];
      const result = (AgentService as any).detectConversationPhase(messages);
      expect(result.phase).toBe('implementation');
      expect(result.recommendedLimit).toBe(10);
    });

    it('scoreMessageImportance boosts score for errors and solutions', () => {
      const errorMsg: ChatMessage = {
        id: 1,
        role: 'user',
        content: 'There is a critical issue here',
        conversationId: 1,
        createdAt: new Date().toISOString(),
      };
      const solutionMsg: ChatMessage = {
        id: 2,
        role: 'assistant',
        content: 'I have fixed it',
        conversationId: 1,
        createdAt: new Date().toISOString(),
      };
      const plainMsg: ChatMessage = {
        id: 3,
        role: 'user',
        content: 'Hello there',
        conversationId: 1,
        createdAt: new Date().toISOString(),
      };

      const errorScore = (AgentService as any).scoreMessageImportance(errorMsg);
      const solutionScore = (AgentService as any).scoreMessageImportance(
        solutionMsg,
      );
      const plainScore = (AgentService as any).scoreMessageImportance(plainMsg);

      expect(errorScore).toBeGreaterThan(plainScore);
      expect(solutionScore).toBeGreaterThan(plainScore);
    });

    it('buildBudgetForModel scales budget properly', () => {
      const budget = (AgentService as any).buildBudgetForModel('test-model'); // mocked context window is 100,000
      expect(budget.maxTotal).toBe(85000); // 85% of 100k
      expect(budget.recentMessages).toBe(51000); // 60% of 85k
    });
  });
});
