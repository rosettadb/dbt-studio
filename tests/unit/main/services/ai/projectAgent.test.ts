/**
 * Project agent by project type (plan 95a): dbt projects keep the dbt tools
 * and instructions; projects without dbt (Analytics) get neither.
 */

const toolSet = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, { name }]));

jest.mock('ai', () => ({
  ToolLoopAgent: class {
    config: unknown;

    constructor(config: unknown) {
      this.config = config;
    }
  },
  stepCountIs: (n: number) => n,
  tool: (definition: unknown) => definition,
}));
jest.mock('../../../../../src/main/services/ai/tools/dbt.tools', () => {
  const tools = Object.fromEntries(
    [
      'readDbtModel',
      'writeDbtModel',
      'runDbtCommand',
      'listDbtModels',
      'getDbtLogs',
    ].map((name) => [name, { name }]),
  );
  return { createDbtTools: () => tools, dbtTools: tools };
});
jest.mock('../../../../../src/main/services/ai/tools/studio/cli.tools', () => ({
  createStudioCliTools: () => ({ studio_cli_run_dbt: {} }),
}));
jest.mock('../../../../../src/main/services/ai/tools/studio/sql.tools', () => ({
  createStudioSqlTools: () => ({ studio_sql_schema_extract: {} }),
}));
jest.mock('../../../../../src/main/services/ai/tools/filesystem.tools', () => {
  const tools = Object.fromEntries(
    ['listDirectory', 'readFile', 'writeFile', 'pathExists'].map((name) => [
      name,
      { name },
    ]),
  );
  return { createFilesystemTools: () => tools, filesystemTools: tools };
});
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/pipeline.tools',
  () => ({
    createStudioPipelineTools: () => ({
      studio_pipeline_list: {},
      studio_pipeline_read: {},
      studio_pipeline_generate: {},
      studio_pipeline_update: {},
    }),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/keystore.tools',
  () => ({
    createStudioKeystoreTools: () => ({
      studio_keystore_register_placeholder: {},
    }),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/agents/composeAgentRuntime',
  () => ({
    composeAgentRuntime: (
      _base: unknown,
      instructions: string,
      tools: Record<string, unknown>,
    ) => ({ instructions, tools }),
  }),
);

// eslint-disable-next-line import/first
import { createProjectAgent } from '../../../../../src/main/services/ai/agents/projectAgent';

const DBT_TOOLS = [
  'readDbtModel',
  'writeDbtModel',
  'runDbtCommand',
  'listDbtModels',
  'getDbtLogs',
  'studio_cli_run_dbt',
];

const base = { mcpTools: {}, model: {}, maxSteps: 5 } as any;

// Every tool the user can toggle is on, as in the default AI settings
const enabledTools = toolSet(
  ...DBT_TOOLS,
  'listDirectory',
  'readFile',
  'writeFile',
  'pathExists',
  'studio_pipeline_list',
  'studio_pipeline_read',
  'studio_pipeline_generate',
  'studio_pipeline_update',
  'studio_keystore_register_placeholder',
);

const build = async (
  options: { hasDbt?: boolean; toolMode?: 'chat' | 'agent' } = {},
) => {
  const agent = (await createProjectAgent(base, {
    projectPath: '/projects/sales',
    enabledTools,
    skills: '',
    toolMode: options.toolMode ?? 'agent',
    hasDbt: options.hasDbt,
  })) as unknown as {
    config: { instructions: string; tools: Record<string, unknown> };
  };
  return agent.config;
};

describe('createProjectAgent by project type', () => {
  it('keeps the dbt tools and instructions for dbt projects', async () => {
    const { tools, instructions } = await build();

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'readDbtModel',
        'writeDbtModel',
        'listDbtModels',
        'getDbtLogs',
        'studio_cli_run_dbt',
        'writeFile',
      ]),
    );
    expect(instructions).toContain('## Active dbt Project');
    expect(instructions).toContain('studio_cli_run_dbt');
  });

  it('gives projects without dbt no dbt tools', async () => {
    const { tools } = await build({ hasDbt: false });

    DBT_TOOLS.forEach((name) => expect(tools).not.toHaveProperty(name));
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'listDirectory',
        'readFile',
        'writeFile',
        'pathExists',
        'studio_sql_schema_extract',
        'studio_pipeline_list',
      ]),
    );
  });

  it('gives projects without dbt instructions without dbt tools or commands', async () => {
    const { instructions } = await build({ hasDbt: false });

    expect(instructions).toContain('## Active Analytics Project');
    expect(instructions).toContain('never suggest or run dbt');
    ['readDbtModel', 'studio_cli_run_dbt', 'dbt debug'].forEach((text) =>
      expect(instructions).not.toContain(text),
    );
  });

  it('keeps Ask mode read-only for projects without dbt', async () => {
    const { tools, instructions } = await build({
      hasDbt: false,
      toolMode: 'chat',
    });

    DBT_TOOLS.forEach((name) => expect(tools).not.toHaveProperty(name));
    expect(tools).not.toHaveProperty('studio_pipeline_generate');
    expect(instructions).toContain('Ask (read-only) mode');
    expect(instructions).not.toContain('- writeFile: Write any text file');
  });
});
