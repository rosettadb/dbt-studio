import { stepCountIs } from 'ai';
import { createNotebooksAgent } from '../../../../../src/main/services/ai/agents/notebooksAgent';
import { formatPythonNotebookContext } from '../../../../../src/main/services/ai/agents/notebooksAgent.prompts';
import { composeAgentRuntime } from '../../../../../src/main/services/ai/agents/composeAgentRuntime';
import PythonNotebooksService from '../../../../../src/main/services/pythonNotebooks.service';
import { createStudioSqlTools } from '../../../../../src/main/services/ai/tools/studio/sql.tools';
import type { PythonNotebook } from '../../../../../src/types/pythonNotebooks';

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  ToolLoopAgent: jest.fn(),
  stepCountIs: jest.fn((steps: number) => ({ steps })),
}));
jest.mock(
  '../../../../../src/main/services/ai/agents/composeAgentRuntime',
  () => ({
    composeAgentRuntime: jest.fn(
      (_base: unknown, instructions: string, tools: Record<string, any>) => ({
        instructions,
        tools,
      }),
    ),
  }),
);
jest.mock('../../../../../src/main/services/pythonNotebooks.service', () => ({
  __esModule: true,
  default: { getNotebook: jest.fn() },
}));
jest.mock('../../../../../src/main/services/notebooks.service', () => ({
  NotebooksService: { getNotebook: jest.fn().mockResolvedValue(null) },
}));
jest.mock('../../../../../src/main/services/notebookKernel.service', () => ({
  __esModule: true,
  default: {
    getStatus: jest.fn(() => ({ notebookId: 'nb', status: 'idle', queue: [] })),
  },
}));

const fakeTools = (...names: string[]) =>
  Object.fromEntries(names.map((name) => [name, { description: name }]));

jest.mock(
  '../../../../../src/main/services/ai/tools/studio/connections.tools',
  () => ({
    createStudioConnectionsTools: () =>
      fakeTools('studio_connections_list', 'studio_connections_test'),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/cloud.tools',
  () => ({
    createStudioCloudTools: () =>
      fakeTools('studio_cloud_list_objects', 'studio_cloud_preview_data'),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/ducklake.tools',
  () => ({
    createStudioDuckLakeTools: () =>
      fakeTools('studio_ducklake_schema_extract', 'studio_ducklake_query'),
  }),
);
jest.mock('../../../../../src/main/services/ai/tools/studio/sql.tools', () => ({
  createStudioSqlTools: jest.fn(() =>
    fakeTools(
      'studio_sql_schema_extract',
      'studio_sql_query',
      'studio_sql_get_query_results',
    ),
  ),
}));
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/notebooks.tools',
  () => ({
    createStudioNotebooksTools: () =>
      fakeTools(
        'notebooks_get_state',
        'notebooks_cell_read',
        'notebooks_cell_add',
        'notebooks_cell_run',
      ),
  }),
);
jest.mock(
  '../../../../../src/main/services/ai/tools/studio/pythonNotebook.tools',
  () => ({
    createPythonNotebookTools: () =>
      fakeTools(
        'notebooks_get_state',
        'notebooks_cell_read',
        'notebooks_cell_add',
        'notebooks_cell_run',
        'notebooks_variables',
        'notebooks_packages_list',
        'notebooks_packages_install',
      ),
  }),
);
jest.mock('../../../../../src/main/services/ai/tools/dbt.tools', () => ({
  createDbtTools: () => fakeTools('readDbtModel', 'runDbtCommand'),
}));
jest.mock('../../../../../src/main/services/ai/tools/filesystem.tools', () => ({
  createFilesystemTools: () => fakeTools('readFile', 'writeFile'),
}));

const getNotebook = PythonNotebooksService.getNotebook as jest.Mock;
const compose = composeAgentRuntime as jest.Mock;

const pythonNotebook = (
  cells: PythonNotebook['cells'] = [],
): PythonNotebook => ({
  id: 'nb',
  kind: 'python',
  name: 'Revenue analysis',
  cells,
  createdAt: '',
  updatedAt: '',
  cellCount: cells.length,
  runtime: { pythonVersion: '3.12', venvPath: '/v', status: 'ready' },
});

const base = { model: {}, maxSteps: 1, mcpTools: {} } as any;

async function build(
  options: {
    type?: string;
    toolMode?: 'chat' | 'agent';
    disabledTools?: string[];
    linked?: boolean;
  } = {},
) {
  await createNotebooksAgent(base, {
    connectionMeta: {
      name: 'warehouse',
      type: options.type ?? 'postgres',
      linkedDbtProject: options.linked
        ? { id: 'p', name: 'proj', path: '/proj' }
        : null,
    },
    notebookId: 'nb',
    connectionId: 'conn',
    enabledTools: { readDbtModel: true, readFile: true },
    disabledTools: options.disabledTools,
    skills: '',
    conversationId: 1,
    toolMode: options.toolMode ?? 'agent',
  });
  const [, instructions, tools] =
    compose.mock.calls[compose.mock.calls.length - 1];
  return {
    instructions: instructions as string,
    tools: tools as Record<string, any>,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getNotebook.mockResolvedValue(pythonNotebook());
});

describe('createNotebooksAgent', () => {
  it('gives Python notebooks the Python prompt, tools and a 12-step floor', async () => {
    const { instructions, tools } = await build();
    expect(instructions).toContain('## Active Notebook: Revenue analysis');
    expect(instructions).toContain('notebooks_variables');
    expect(instructions).not.toContain('ONE SQL statement per cell');
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        'notebooks_variables',
        'notebooks_packages_install',
        'studio_sql_schema_extract',
      ]),
    );
    expect(stepCountIs).toHaveBeenCalledWith(12);
  });

  it('keeps the legacy prompt and tools for SQL notebooks', async () => {
    getNotebook.mockResolvedValue(null);
    const { instructions, tools } = await build();
    expect(instructions).toContain('ONE SQL statement per cell');
    expect(instructions).toContain('Use the schema tool');
    expect(tools.notebooks_variables).toBeUndefined();
    expect(stepCountIs).toHaveBeenCalledWith(2);
  });

  it('gives non-DuckLake connections the SQL schema tool and no query tools', async () => {
    const { tools } = await build({ type: 'snowflake' });
    expect(createStudioSqlTools).toHaveBeenCalledWith(1, {
      forceSchemaExtract: true,
    });
    expect(tools.studio_sql_schema_extract).toBeDefined();
    expect(tools.studio_sql_query).toBeUndefined();
    expect(tools.studio_sql_get_query_results).toBeUndefined();
    expect(tools.studio_ducklake_schema_extract).toBeUndefined();
  });

  it.each([
    ['Python', true],
    ['legacy', false],
  ])(
    'never registers studio_ducklake_query on DuckLake (%s notebook)',
    async (_kind, isPython) => {
      getNotebook.mockResolvedValue(isPython ? pythonNotebook() : null);
      const { tools } = await build({ type: 'ducklake' });
      expect(tools.studio_ducklake_schema_extract).toBeDefined();
      expect(tools.studio_ducklake_query).toBeUndefined();
      expect(tools.studio_sql_schema_extract).toBeUndefined();
    },
  );

  it('stubs write and run tools in Ask mode', async () => {
    const { tools } = await build({ toolMode: 'chat' });
    expect(tools.notebooks_cell_add.description).toMatch(/^\[ASK MODE\]/);
    expect(tools.notebooks_cell_run.description).toMatch(/^\[ASK MODE\]/);
    expect(tools.notebooks_packages_install.description).toMatch(
      /^\[ASK MODE\]/,
    );
    expect(tools.notebooks_variables.description).toBe('notebooks_variables');
    expect(tools.notebooks_packages_list.description).toBe(
      'notebooks_packages_list',
    );
  });

  it('drops the tools turned off in Settings', async () => {
    const { tools } = await build({
      disabledTools: ['notebooks_cell_run', 'studio_connections_test'],
    });
    expect(tools.notebooks_cell_run).toBeUndefined();
    expect(tools.studio_connections_test).toBeUndefined();
    expect(tools.notebooks_cell_add).toBeDefined();
  });

  it('adds only the enabled project tools when a dbt project is linked', async () => {
    const { tools } = await build({ linked: true });
    expect(tools.readDbtModel).toBeDefined();
    expect(tools.readFile).toBeDefined();
    expect(tools.runDbtCommand).toBeUndefined();
    expect(tools.writeFile).toBeUndefined();
  });
});

describe('formatPythonNotebookContext', () => {
  it('lists cells with full ids, status and output labels', () => {
    const text = formatPythonNotebookContext(
      pythonNotebook([
        {
          id: 'id-1',
          cell_type: 'code',
          source: 'import pandas as pd',
          outputs: [],
          execution_count: 1,
          metadata: {},
        },
        {
          id: 'id-2',
          cell_type: 'sql',
          source: 'SELECT order_date FROM orders',
          outputs: [],
          execution_count: null,
          metadata: { rosetta: { language: 'sql', variable: 'df' } },
        },
        {
          id: 'id-3',
          cell_type: 'markdown',
          source: '# Revenue by month',
          outputs: [],
          execution_count: null,
          metadata: {},
        },
      ]),
      'idle',
    );
    expect(text).toContain(
      '## Active Notebook: Revenue analysis (Python 3.12 · env ready · kernel idle)',
    );
    expect(text).toContain('3 cells, saved state.');
    expect(text).toContain('[1] code · ok · id id-1 · import pandas as pd');
    expect(text).toContain(
      '[2] sql → df · never run · id id-2 · SELECT order_date FROM orders',
    );
    expect(text).toContain('[3] markdown · id id-3 · # Revenue by month');
  });

  it('shows at most 60 cells', () => {
    const cells = Array.from({ length: 65 }, (_, i) => ({
      id: `id-${i}`,
      cell_type: 'code' as const,
      source: `x = ${i}`,
      outputs: [],
      execution_count: null,
      metadata: {},
    }));
    const text = formatPythonNotebookContext(pythonNotebook(cells), 'stopped');
    expect(text).toContain('[60] code');
    expect(text).not.toContain('[61] code');
    expect(text).toContain('… 5 more cells');
  });
});
