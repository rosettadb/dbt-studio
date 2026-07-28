import MainDatabaseService from '../../../../../../src/main/services/mainDatabase.service';
import SecondBrainRuntimeService, {
  getSecondBrainInitialPageIds,
  isSecondBrainPageAuthorized,
  toSecondBrainScopeKey,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrainRuntime.service';

jest.mock('../../../../../../src/main/services/mainDatabase.service', () => ({
  __esModule: true,
  default: { getConversationScope: jest.fn() },
}));

describe('Second Brain runtime scope resolution', () => {
  let runtime: SecondBrainRuntimeService;

  beforeEach(() => {
    jest.clearAllMocks();
    (MainDatabaseService.getConversationScope as jest.Mock).mockResolvedValue({
      id: 7,
      projectId: 42,
      screenKey: 'notebooks',
      connectionId: 'warehouse-dev',
      notebookId: 'revenue-notebook',
      pageId: null,
    });
    runtime = new SecondBrainRuntimeService({} as any);
  });

  it('uses persisted identifiers and runtime-only project path', async () => {
    const scope = await runtime.resolveScope(7, {
      screenKey: 'notebooks',
      connectionId: 'warehouse-dev',
      notebookId: 'revenue-notebook',
      projectPath: '/safe/project',
    });

    expect(scope).toEqual({
      screenKey: 'notebooks',
      projectId: 42,
      projectPath: '/safe/project',
      connectionId: 'warehouse-dev',
      notebookId: 'revenue-notebook',
      pageId: null,
    });
  });

  it('rejects a runtime scope that conflicts with the conversation', async () => {
    await expect(
      runtime.resolveScope(7, {
        screenKey: 'notebooks',
        connectionId: 'another-warehouse',
        notebookId: 'revenue-notebook',
      }),
    ).rejects.toMatchObject({ code: 'SCOPE_MISMATCH' });
  });

  it('creates stable collision-resistant filesystem keys', () => {
    expect(toSecondBrainScopeKey('Warehouse Dev')).toMatch(
      /^warehouse-dev-[a-f0-9]{10}$/u,
    );
    expect(toSecondBrainScopeKey('Warehouse Dev')).toBe(
      toSecondBrainScopeKey('Warehouse Dev'),
    );
    expect(toSecondBrainScopeKey('Warehouse-Dev')).not.toBe(
      toSecondBrainScopeKey('Warehouse Dev'),
    );
  });

  it('builds exact initial maps and authorization for all four agent screens', () => {
    const connectionKey = toSecondBrainScopeKey('warehouse-dev');
    const notebookKey = toSecondBrainScopeKey('revenue-notebook');
    const analyticsKey = toSecondBrainScopeKey('revenue-page');
    const projectKey = toSecondBrainScopeKey(42);
    const scopes = {
      project: { screenKey: 'project' as const, projectId: 42 },
      sql: {
        screenKey: 'sql' as const,
        connectionId: 'warehouse-dev',
      },
      notebooks: {
        screenKey: 'notebooks' as const,
        connectionId: 'warehouse-dev',
        notebookId: 'revenue-notebook',
      },
      analytics: {
        screenKey: 'analytics' as const,
        connectionId: 'warehouse-dev',
        pageId: 'revenue-page',
      },
    };

    expect(getSecondBrainInitialPageIds(scopes.project)).toEqual([
      'MEMORY.md',
      `projects/${projectKey}/index.md`,
    ]);
    expect(getSecondBrainInitialPageIds(scopes.sql)).toEqual([
      'MEMORY.md',
      `connections/${connectionKey}/index.md`,
    ]);
    expect(getSecondBrainInitialPageIds(scopes.notebooks)).toEqual([
      'MEMORY.md',
      `notebooks/${connectionKey}/${notebookKey}.md`,
      `connections/${connectionKey}/index.md`,
    ]);
    expect(getSecondBrainInitialPageIds(scopes.analytics)).toEqual([
      'MEMORY.md',
      `analytics/${connectionKey}/${analyticsKey}.md`,
      `connections/${connectionKey}/index.md`,
    ]);
    expect(
      isSecondBrainPageAuthorized(
        `notebooks/${connectionKey}/${notebookKey}.md`,
        scopes.notebooks,
      ),
    ).toBe(true);
    expect(
      isSecondBrainPageAuthorized(
        `notebooks/${connectionKey}/${toSecondBrainScopeKey('other')}.md`,
        scopes.notebooks,
      ),
    ).toBe(false);
    expect(
      isSecondBrainPageAuthorized(
        `analytics/${connectionKey}/${analyticsKey}.md`,
        scopes.sql,
      ),
    ).toBe(false);
  });
});
