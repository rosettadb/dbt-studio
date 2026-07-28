import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import SecondBrainService from '../../../../../../src/main/services/ai/secondBrain/secondBrain.service';
import SecondBrainRefreshService, {
  buildSecondBrainGenerationPrompt,
  redactSecondBrainEvidence,
  SecondBrainEvidenceItem,
  SecondBrainRefreshOperation,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrainRefresh.service';
import {
  SecondBrainAnalyticsEvidenceRow,
  SecondBrainSessionEvidenceRow,
} from '../../../../../../src/main/services/mainDatabase.service';

const fixedDate = new Date('2026-07-15T12:00:00.000Z');

const sessionRow: SecondBrainSessionEvidenceRow = {
  stableId: '11',
  conversationId: 7,
  conversationTitle: 'Revenue workflow',
  projectId: 42,
  screenKey: 'project',
  connectionId: 'warehouse',
  notebookId: null,
  pageId: null,
  role: 'user',
  content: 'Always validate revenue totals before publishing.',
  toolCalls: [{ toolName: 'dbt_run', toolOutput: 'must not be projected' }],
  contextItems: [{ name: 'models/revenue.sql', content: 'large body' }],
  createdAt: fixedDate.toISOString(),
  updatedAt: fixedDate.toISOString(),
};

const analyticsRow: SecondBrainAnalyticsEvidenceRow = {
  stableId: 'analytics-1',
  connectionId: 'warehouse',
  title: 'Revenue dashboard',
  routePath: '/analytics/revenue',
  markdownContent: 'Revenue reporting overview.',
  createdAt: fixedDate.toISOString(),
  updatedAt: fixedDate.toISOString(),
};

const durableOperation: SecondBrainRefreshOperation = {
  type: 'create',
  pageId: 'topics/revenue-validation.md',
  content: `---
type: Project Knowledge
id: revenue-validation
title: Revenue validation
scope: global
updated_by: refresh
sources: []
---

# Revenue validation

Validate revenue totals before publishing.
`,
  rationale: 'The user stated a durable workflow rule.',
  confidence: 0.95,
  provenanceIds: ['conversation:7:message:11'],
};

const emptyAdditionalSources = {
  loadConnections: jest.fn(async () => []),
  listNotebooks: jest.fn(async () => []),
  collectGitStatus: jest.fn(async () => ({})),
  collectDbtRuntimeEvidence: jest.fn(async () => ({
    version: null,
    pythonPath: '',
    dbtPath: null,
    isDbtCorePackage: false,
    isExecutableVerified: false,
  })),
};

describe('SecondBrainRefreshService', () => {
  let temporaryDirectory: string;
  let rootPath: string;
  let secondBrain: SecondBrainService;

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-second-brain-refresh-'),
    );
    rootPath = path.join(temporaryDirectory, 'second-brain');
    secondBrain = new SecondBrainService({
      rootPath,
      now: () => fixedDate,
      createId: () => '00000000-0000-4000-8000-000000000001',
    });
    await secondBrain.initializeRoot();
  });

  afterEach(async () => {
    await fs.remove(temporaryDirectory);
  });

  it('redacts credentials, environment values, and absolute home paths', () => {
    const redacted = redactSecondBrainEvidence(
      'api_key = abcdefghijklmnop\nrefreshToken: refresh-secret-value\n"authorization": "Bearer-secret-value"\nkeyfile=/private/key.json\nDB_PASSWORD=hunter2\npostgres://user:password@host/db\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----\n/Users/nuri/private/model.sql',
    );

    expect(redacted).not.toContain('abcdefghijklmnop');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('refresh-secret-value');
    expect(redacted).not.toContain('Bearer-secret-value');
    expect(redacted).not.toContain('/private/key.json');
    expect(redacted).not.toContain('postgres://');
    expect(redacted).not.toContain('private-material');
    expect(redacted).not.toContain('/Users/nuri');
    expect(redacted).toContain('[REDACTED]');
  });

  it('budgets evidence before serialization and marks omitted items', () => {
    const evidence: SecondBrainEvidenceItem[] = Array.from(
      { length: 60 },
      (_, index) => ({
        sourceId: 'sessions',
        sourceKind: 'session',
        stableId: String(index),
        updatedAt: fixedDate.toISOString(),
        contentHash: String(index).padStart(64, '0'),
        scope: {},
        provenance: `conversation:7:message:${index}`,
        projection: { content: 'x'.repeat(8_000) },
        truncated: false,
      }),
    );

    const prompt = buildSecondBrainGenerationPrompt([], evidence);
    const parsed = JSON.parse(prompt);

    expect(prompt.length).toBeLessThanOrEqual(300_000);
    expect(parsed.constraints.evidenceTruncated).toBe(true);
    expect(parsed.evidence.length).toBeLessThan(evidence.length);
    expect(
      parsed.evidence.map((item: SecondBrainEvidenceItem) => item.stableId),
    ).toEqual(
      evidence.slice(0, parsed.evidence.length).map((item) => item.stableId),
    );
  });

  it('applies structured operations, commits cursors, then performs a true no-op', async () => {
    const generateOperations = jest.fn(async () => [durableOperation]);
    const collectSessions = jest.fn(async ({ after }) =>
      after ? [] : [sessionRow],
    );
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations,
      collectSessions: collectSessions as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const first = await refresh.refresh({});
    expect(first).toMatchObject({
      status: 'completed',
      modelCalled: true,
      operationsApplied: 1,
    });
    const page = await secondBrain.readPage(durableOperation.pageId);
    expect(page.frontmatter.sources).toEqual([
      {
        id: expect.stringMatching(/^source-[a-f0-9]{12}$/u),
        resource: 'session://7/summary',
      },
    ]);
    expect(page.frontmatter.generated).toMatchObject({
      by: 'process:rosetta-agent-memory-refresh',
      at: expect.any(String),
    });
    expect(page.frontmatter.verified).toBeUndefined();
    expect(page.content).not.toContain('second-brain-sources');
    expect((await secondBrain.readStateFile())?.sourceCursors.sessions).toEqual(
      { updatedAt: fixedDate.toISOString(), stableId: '11' },
    );

    const stateBefore = await fs.readFile(
      path.join(rootPath, 'state.json'),
      'utf8',
    );
    const second = await refresh.refresh({});
    const stateAfter = await fs.readFile(
      path.join(rootPath, 'state.json'),
      'utf8',
    );

    expect(second).toMatchObject({
      status: 'no-change',
      modelCalled: false,
      operationsApplied: 0,
    });
    expect(generateOperations).toHaveBeenCalledTimes(1);
    expect(stateAfter).toBe(stateBefore);
  });

  it('does not advance source state or write pages during a dry run', async () => {
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => [durableOperation]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({ dryRun: true });

    expect(result).toMatchObject({
      status: 'completed',
      dryRun: true,
      operationsApplied: 0,
    });
    expect((await secondBrain.readStateFile())?.sourceCursors).toEqual({});
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects generated pages containing credentials without advancing source cursors', async () => {
    const unsafeOperation = {
      ...durableOperation,
      content: durableOperation.content.replace(
        'Validate revenue totals before publishing.',
        'api_key = abcdefghijklmnop',
      ),
    };
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => [unsafeOperation]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});

    expect(result.operationsApplied).toBe(0);
    expect(
      (await secondBrain.readStateFile())?.sourceCursors.sessions,
    ).toBeUndefined();
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('commits unaffected sources when every proposed operation is rejected', async () => {
    const unsafeOperation = {
      ...durableOperation,
      content: durableOperation.content.replace(
        'Validate revenue totals before publishing.',
        'api_key = abcdefghijklmnop',
      ),
    };
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => [unsafeOperation]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => [analyticsRow]) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});
    const state = await secondBrain.readStateFile();

    expect(result.operationsApplied).toBe(0);
    expect(state?.sourceCursors.sessions).toBeUndefined();
    expect(state?.sourceCursors.analytics).toEqual({
      updatedAt: fixedDate.toISOString(),
      stableId: 'analytics-1',
    });
  });

  it('accepts OKF documents with type frontmatter and no title', async () => {
    const operationWithoutTitle = {
      ...durableOperation,
      content: durableOperation.content.replace(
        'title: Revenue validation\n',
        '',
      ),
    };
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => [operationWithoutTitle]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});

    expect(result).toMatchObject({
      status: 'completed',
      operationsApplied: 1,
      operationsSkipped: 0,
    });
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).resolves.toBeDefined();
    expect(
      (await secondBrain.readStateFile())?.sourceCursors.sessions,
    ).toBeDefined();
  });

  it('collects only verified Apache dbt runtime evidence without paths or output', async () => {
    const runtimeOperation: SecondBrainRefreshOperation = {
      ...durableOperation,
      pageId: 'topics/dbt-runtime.md',
      provenanceIds: ['rosetta:dbt-core:installed-package'],
    };
    const generateOperations = jest.fn(async ({ evidence }) => {
      expect(evidence).toContainEqual(
        expect.objectContaining({
          sourceId: 'dbt-runtime',
          provenance: 'rosetta:dbt-core:installed-package',
          projection: {
            package: 'apache-dbt-core',
            version: '2.1.0',
            runtime: 'v2',
            executableVerified: true,
          },
        }),
      );
      expect(JSON.stringify(evidence)).not.toContain('/private/runtime');
      expect(JSON.stringify(evidence)).not.toContain('raw dbt output');
      return [runtimeOperation];
    });
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      collectDbtRuntimeEvidence: jest.fn(async () => ({
        version: '2.1.0',
        pythonPath: '/private/runtime/python',
        dbtPath: '/private/runtime/dbt',
        dbtVersionOutput: 'raw dbt output',
        isDbtCorePackage: true,
        isExecutableVerified: true,
      })),
      generateOperations,
      collectSessions: jest.fn(async () => []) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});
    const page = await secondBrain.readPage(runtimeOperation.pageId);

    expect(result.operationsApplied).toBe(1);
    expect(page.frontmatter.sources).toEqual([
      {
        id: expect.stringMatching(/^source-[a-f0-9]{12}$/u),
        resource: 'rosetta://dbt-core/installed-package',
      },
    ]);
  });

  it('skips malformed model page IDs without aborting initialization', async () => {
    const malformedOperation = {
      ...durableOperation,
      pageId: 'Topics/Revenue Validation',
    };
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      getModel: jest.fn(async () => ({}) as any),
      generateOperations: jest.fn(async () => [
        malformedOperation,
        durableOperation,
      ]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({ initialize: true });

    expect(result).toMatchObject({
      status: 'completed',
      operationsProposed: 2,
      operationsSkipped: 1,
      operationsApplied: 1,
      changedPageIds: [durableOperation.pageId],
    });
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).resolves.toBeDefined();
    expect(
      (await secondBrain.readStateFile())?.sourceCursors.sessions,
    ).toBeDefined();
  });

  it('continues after an apply failure and withholds the failed source cursor', async () => {
    const failingOperation = {
      ...durableOperation,
      pageId: 'topics/failing-operation.md',
    };
    const originalWritePage = secondBrain.writePage.bind(secondBrain);
    jest.spyOn(secondBrain, 'writePage').mockImplementation(async (input) => {
      if (input.pageId === failingOperation.pageId) {
        throw new Error('Simulated disk failure');
      }
      return originalWritePage(input);
    });
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => [
        failingOperation,
        durableOperation,
      ]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});

    expect(result).toMatchObject({
      status: 'partial',
      operationsProposed: 2,
      operationsSkipped: 0,
      operationsApplied: 1,
      operationsFailed: 1,
      failures: [{ pageId: failingOperation.pageId, code: 'APPLY_FAILED' }],
      changedPageIds: [durableOperation.pageId],
    });
    expect(
      (await secondBrain.readStateFile())?.sourceCursors.sessions,
    ).toBeUndefined();
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).resolves.toBeDefined();
  });

  it('validates provider availability before initialization mutates the wiki', async () => {
    const uninitializedRoot = path.join(temporaryDirectory, 'provider-failure');
    const uninitialized = new SecondBrainService({
      rootPath: uninitializedRoot,
    });
    const refresh = new SecondBrainRefreshService(uninitialized, {
      ...emptyAdditionalSources,
      getModel: jest.fn(async () => {
        throw new Error('Provider unavailable');
      }),
      generateOperations: jest.fn(async () => []),
      collectSessions: jest.fn(async () => []) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });
    const onProgress = jest.fn();

    await expect(
      refresh.refresh({ initialize: true, onProgress }),
    ).rejects.toThrow('Provider unavailable');
    expect(onProgress).toHaveBeenLastCalledWith({
      stage: 'failed',
      completed: 0,
      message: 'Wiki Memory operation failed.',
    });
    expect(await fs.pathExists(uninitializedRoot)).toBe(false);
  });

  it('does not advance source cursors when generation fails', async () => {
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations: jest.fn(async () => {
        throw new Error('Structured generation failed');
      }),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    await expect(refresh.refresh({})).rejects.toThrow(
      'Structured generation failed',
    );
    expect((await secondBrain.readStateFile())?.sourceCursors).toEqual({});
  });

  it('collects bounded application, notebook, and Git metadata', async () => {
    const projectRoot = path.join(temporaryDirectory, 'project');
    await fs.ensureDir(path.join(projectRoot, '.git'));
    await fs.outputFile(
      path.join(projectRoot, 'dbt_project.yml'),
      'name: revenue_project\n',
    );
    let capturedEvidence: SecondBrainEvidenceItem[] = [];
    const generateOperations = jest.fn(async (input: any) => {
      capturedEvidence = input.evidence;
      return [];
    });
    const refresh = new SecondBrainRefreshService(secondBrain, {
      generateOperations,
      collectSessions: jest.fn(async () => []) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => [
        {
          id: '42',
          name: 'Revenue',
          path: projectRoot,
          createdAt: fixedDate.toISOString(),
          connectionId: 'warehouse',
        },
      ]) as any,
      loadConnections: jest.fn(async () => [
        {
          id: 'warehouse',
          connection: {
            name: 'Warehouse',
            type: 'postgres',
            database: 'analytics',
            schema: 'public',
            username: 'must-not-project',
            password: 'must-not-project',
          },
        },
      ]) as any,
      listNotebooks: jest.fn(async () => [
        {
          id: 'notebook-1',
          name: 'Revenue checks',
          description: 'Durable validation queries',
          cells: [{ id: 'cell-1', type: 'sql', content: 'select 1', order: 0 }],
          createdAt: fixedDate.toISOString(),
          updatedAt: fixedDate.toISOString(),
          cellCount: 1,
        },
      ]) as any,
      collectGitStatus: jest.fn(async () => ({
        branch: 'feature/wiki-memory',
        modified: ['models/revenue.sql'],
      })),
    });

    await refresh.refresh({ dryRun: true });

    expect(new Set(capturedEvidence.map((item) => item.sourceKind))).toEqual(
      new Set(['application', 'notebook', 'git']),
    );
    expect(JSON.stringify(capturedEvidence)).not.toContain('must-not-project');
  });

  it('cancels before collection without a model call or state change', async () => {
    const controller = new AbortController();
    controller.abort();
    const generateOperations = jest.fn(async () => []);
    const collectSessions = jest.fn(async () => [sessionRow]);
    const refresh = new SecondBrainRefreshService(secondBrain, {
      ...emptyAdditionalSources,
      generateOperations,
      collectSessions: collectSessions as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });
    const onProgress = jest.fn();

    await expect(
      refresh.refresh({ abortSignal: controller.signal, onProgress }),
    ).rejects.toMatchObject({ code: 'CANCELLED' });
    expect(onProgress).toHaveBeenLastCalledWith({
      stage: 'cancelled',
      completed: 0,
      message: 'Wiki Memory operation cancelled.',
    });
    expect(collectSessions).not.toHaveBeenCalled();
    expect(generateOperations).not.toHaveBeenCalled();
    expect((await secondBrain.readStateFile())?.sourceCursors).toEqual({});
  });
});
