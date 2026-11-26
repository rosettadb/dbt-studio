import { createProjectAgent } from '../../../../../src/main/services/ai/agents/projectAgent';

const created: Array<{ instructions: string; tools: Record<string, unknown> }> =
  [];

jest.mock('ai', () => ({
  ToolLoopAgent: jest.fn().mockImplementation((config) => {
    created.push(config);
    return config;
  }),
  stepCountIs: jest.fn(),
  tool: jest.fn((definition) => definition),
}));

jest.mock(
  '../../../../../src/main/services/ai/agents/composeAgentRuntime',
  () => ({
    composeAgentRuntime: (
      _base: unknown,
      instructions: string,
      tools: any,
    ) => ({
      instructions,
      tools,
    }),
  }),
);

const fakeTool = (name: string) => ({ description: name });

jest.mock('../../../../../src/main/services/ai/tools/dbt.tools', () => ({
  createDbtTools: () => ({}),
  dbtTools: {},
}));
jest.mock('../../../../../src/main/services/ai/tools/studio/cli.tools', () => ({
  createStudioCliTools: () => ({}),
}));
jest.mock('../../../../../src/main/services/ai/tools/studio/sql.tools', () => ({
  createStudioSqlTools: () => ({}),
}));
jest.mock('../../../../../src/main/services/ai/tools/filesystem.tools', () => ({
  createFilesystemTools: () => ({}),
  filesystemTools: {},
}));
jest.mock('../../../../../src/extensions/pipeline/main/pipeline.tools', () => ({
  createStudioPipelineTools: () => ({}),
}));
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/keystore.tools',
  () => ({
    createStudioKeystoreTools: () => ({}),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/charts.tools',
  () => ({
    createStudioChartsTools: () => ({
      studio_charts_validate: { description: 'studio_charts_validate' },
      studio_charts_refresh_preview: {
        description: 'studio_charts_refresh_preview',
      },
    }),
  }),
);

const base = {
  model: {},
  mcpTools: {},
  skillsPrompt: '',
  loadSkillTool: null,
  secondBrainContext: '',
  secondBrainTools: {},
  secondBrainTokens: 0,
  maxSteps: 5,
  onStepFinish: jest.fn(),
} as any;

const enabledTools = {
  studio_charts_validate: true,
  studio_charts_refresh_preview: true,
};

describe('project agent and dbt Charts', () => {
  beforeEach(() => {
    created.length = 0;
  });

  it('gives Code mode both charts tools and the context block', async () => {
    await createProjectAgent(base, {
      projectPath: '/projects/shop',
      enabledTools,
      skills: '',
      toolMode: 'agent',
      projectChartsContext: '## Project facts\n- dbt Charts: installed 0.11.1',
    });
    const [agent] = created;
    expect(Object.keys(agent.tools)).toEqual(
      expect.arrayContaining([
        'studio_charts_validate',
        'studio_charts_refresh_preview',
      ]),
    );
    expect(agent.instructions).toContain('<dbt_charts_authoring_context>');
    expect(agent.instructions).toContain('installed 0.11.1');
    expect(agent.instructions).toContain('### dbt Charts Tools');
  });

  it('gives Ask mode the validate tool only', async () => {
    await createProjectAgent(base, {
      projectPath: '/projects/shop',
      enabledTools,
      skills: '',
      toolMode: 'chat',
    });
    const [agent] = created;
    expect(agent.tools.studio_charts_validate).toEqual(
      fakeTool('studio_charts_validate'),
    );
    expect(agent.tools).not.toHaveProperty('studio_charts_refresh_preview');
    expect(agent.instructions).not.toContain('<dbt_charts_authoring_context>');
  });

  it('leaves the tools out when they are not enabled', async () => {
    await createProjectAgent(base, {
      projectPath: '/projects/shop',
      enabledTools: {},
      skills: '',
      toolMode: 'agent',
    });
    const [agent] = created;
    expect(agent.tools).not.toHaveProperty('studio_charts_validate');
  });
});
