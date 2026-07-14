import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import SecondBrainService from '../../../../../../src/main/services/ai/secondBrain/secondBrain.service';
import SecondBrainRefreshService, {
  redactSecondBrainEvidence,
  SecondBrainRefreshOperation,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrainRefresh.service';
import { SecondBrainSessionEvidenceRow } from '../../../../../../src/main/services/mainDatabase.service';

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

const durableOperation: SecondBrainRefreshOperation = {
  type: 'create',
  pageId: 'topics/revenue-validation.md',
  content: `---
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
      'api_key = abcdefghijklmnop\nDB_PASSWORD=hunter2\n/Users/nuri/private/model.sql',
    );

    expect(redacted).not.toContain('abcdefghijklmnop');
    expect(redacted).not.toContain('hunter2');
    expect(redacted).not.toContain('/Users/nuri');
    expect(redacted).toContain('[REDACTED]');
  });

  it('applies structured operations, commits cursors, then performs a true no-op', async () => {
    const generateOperations = jest.fn(async () => [durableOperation]);
    const collectSessions = jest.fn(async ({ after }) =>
      after ? [] : [sessionRow],
    );
    const refresh = new SecondBrainRefreshService(secondBrain, {
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
    expect(page.content).toContain('second-brain-sources');
    expect((await secondBrain.readStateFile())?.sourceCursors.sessions).toEqual(
      { updatedAt: fixedDate.toISOString(), stableId: '11' },
    );

    const stateBefore = await fs.readFile(
      path.join(rootPath, '.state.json'),
      'utf8',
    );
    const second = await refresh.refresh({});
    const stateAfter = await fs.readFile(
      path.join(rootPath, '.state.json'),
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

  it('rejects generated pages containing credentials while advancing safe cursors', async () => {
    const unsafeOperation = {
      ...durableOperation,
      content: durableOperation.content.replace(
        'Validate revenue totals before publishing.',
        'api_key = abcdefghijklmnop',
      ),
    };
    const refresh = new SecondBrainRefreshService(secondBrain, {
      generateOperations: jest.fn(async () => [unsafeOperation]),
      collectSessions: jest.fn(async () => [sessionRow]) as any,
      collectAnalytics: jest.fn(async () => []) as any,
      loadProjects: jest.fn(async () => []),
    });

    const result = await refresh.refresh({});

    expect(result.operationsApplied).toBe(0);
    expect(
      (await secondBrain.readStateFile())?.sourceCursors.sessions,
    ).toBeDefined();
    await expect(
      secondBrain.readPage(durableOperation.pageId),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
