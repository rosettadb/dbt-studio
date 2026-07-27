import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import type {
  SecondBrainScope,
  SecondBrainSettings,
} from '../../../../../../src/types/backend';
import { composeAgentRuntime } from '../../../../../../src/main/services/ai/agents/composeAgentRuntime';
import SecondBrainService from '../../../../../../src/main/services/ai/secondBrain/secondBrain.service';
import SecondBrainRuntimeService, {
  toSecondBrainScopeKey,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrainRuntime.service';
import { createSecondBrainTools } from '../../../../../../src/main/services/ai/tools/studio/secondBrain.tools';

jest.setTimeout(30_000);

const settings: SecondBrainSettings = {
  enabled: true,
  initialized: true,
  maxPromptChars: 1800,
  maxPageBytes: 64 * 1024,
  maxTotalBytes: 10 * 1024 * 1024,
  includeGlobalPages: true,
  inlineSelfLearning: true,
};

const markdown = (title: string, body: string) => `---
type: Knowledge Note
id: ${title.toLowerCase().replace(/\s+/gu, '-')}
title: ${title}
scope: project
updated_by: user
sources: []
---

# ${title}

${body}
`;

const executeTool = async (
  tools: Record<string, any>,
  name: string,
  input: Record<string, unknown>,
) => tools[name].execute(input, {});

describe('Second Brain progressive discovery', () => {
  let temporaryDirectory: string;
  let secondBrain: SecondBrainService;
  let runtime: SecondBrainRuntimeService;
  let scope: SecondBrainScope;
  let projectKey: string;

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-progressive-memory-'),
    );
    secondBrain = new SecondBrainService({
      rootPath: path.join(temporaryDirectory, 'second-brain'),
    });
    await secondBrain.initializeRoot();
    projectKey = toSecondBrainScopeKey(42);
    scope = {
      screenKey: 'project',
      projectId: 42,
      projectPath: '/project/forty-two',
    };
    runtime = new SecondBrainRuntimeService(secondBrain);

    await secondBrain.writePage({
      pageId: `projects/${projectKey}/overview.md`,
      content: markdown(
        'Project 42',
        `Project navigation. [[projects/${projectKey}/decisions.md]]`,
      ),
      actor: 'user',
    });
    await secondBrain.writePage({
      pageId: `projects/${projectKey}/decisions.md`,
      content: markdown(
        'Warehouse naming',
        '## Naming\n\nDurable marker: staging models use stg_source_entity.',
      ),
      actor: 'user',
    });
    const otherKey = toSecondBrainScopeKey(99);
    await secondBrain.writePage({
      pageId: `projects/${otherKey}/overview.md`,
      content: markdown(
        'Warehouse naming',
        'Forbidden marker from another project.',
      ),
      actor: 'user',
    });
  });

  afterEach(async () => {
    await fs.remove(temporaryDirectory);
  });

  it('searches only authorized pages with deterministic ranking', async () => {
    const result = await runtime.search('warehouse naming', scope, {
      limit: 5,
    });

    expect(result.results[0]).toMatchObject({
      pageId: `projects/${projectKey}/decisions.md`,
      scoreReason: 'exact-title',
    });
    expect(result.results.map((item) => item.excerpt).join(' ')).not.toContain(
      'Forbidden marker',
    );
  });

  it('discovers concepts through OKF metadata without searching indexes', async () => {
    await secondBrain.writePage({
      pageId: `projects/${projectKey}/reconciliation.md`,
      content: markdown(
        'Reconciliation',
        'Durable validation details.',
      ).replace(
        'title: Reconciliation',
        'title: Reconciliation\ndescription: Monthly finance close checklist\ntags: [finance, close]',
      ),
      actor: 'user',
    });

    const result = await runtime.search('monthly finance close', scope);
    expect(result.results[0]).toMatchObject({
      pageId: `projects/${projectKey}/reconciliation.md`,
    });
    expect(
      result.results.every((item) => !item.pageId.endsWith('index.md')),
    ).toBe(true);
  });

  it('injects only memory.md and the scoped index under the prompt budget', async () => {
    const result = await runtime.buildContext(scope, settings);

    expect(result.includedPageIds).toEqual([
      'memory.md',
      `projects/${projectKey}/index.md`,
    ]);
    expect(result.context).toContain('user-controlled reference data');
    expect(result.context).toContain(`Page: projects/${projectKey}/index.md`);
    expect(result.context).toContain('### Active writable scope');
    expect(result.context).toContain(
      `Existing scoped page: \`projects/${projectKey}/index.md\``,
    );
    expect(result.context).toContain(
      `Writable prefix: \`projects/${projectKey}/\``,
    );
    expect(result.context).not.toContain('Durable marker');
    expect(result.context.length).toBeLessThanOrEqual(settings.maxPromptChars);
  });

  it('labels a missing scoped concept, never an index, as a creation target', async () => {
    const pageId = `projects/${projectKey}/overview.md`;
    const page = await secondBrain.readPage(pageId);
    await secondBrain.archivePage({
      pageId,
      expectedHash: page.hash,
      actor: 'user',
    });

    const result = await runtime.buildContext(scope, settings);

    expect(result.includedPageIds).toEqual([
      'memory.md',
      `projects/${projectKey}/index.md`,
    ]);
    expect(result.context).toContain(
      `Suggested create target (not found until created): \`${pageId}\``,
    );
    expect(result.context).not.toContain(
      `Suggested create target (not found until created): \`projects/${projectKey}/index.md\``,
    );
    expect(result.context).not.toContain(`Page: ${pageId}`);
  });

  it.each(['memory', 'memory.md', '[[memory]]'])(
    'reads the global entry page from the %s wiki reference',
    async (pageId) => {
      const tools = createSecondBrainTools({
        secondBrain,
        runtime,
        scope,
        settings: { ...settings, includeGlobalPages: false },
        toolMode: 'chat',
      });

      await expect(
        executeTool(tools, 'wiki_read', { pageId }),
      ).resolves.toMatchObject({
        ok: true,
        pageId: 'memory.md',
        title: 'Wiki Memory',
      });
    },
  );

  it('keeps Chat mode read-only and rejects cross-scope reads', async () => {
    const chatTools = createSecondBrainTools({
      secondBrain,
      runtime,
      scope,
      settings,
      toolMode: 'chat',
    });
    const otherKey = toSecondBrainScopeKey(99);
    const denied = await executeTool(chatTools, 'wiki_read', {
      pageId: `projects/${otherKey}/index`,
    });
    const status = await executeTool(chatTools, 'wiki_status', {});
    const noLearningTools = createSecondBrainTools({
      secondBrain,
      runtime,
      scope,
      settings: { ...settings, inlineSelfLearning: false },
      toolMode: 'agent',
    });

    expect(Object.keys(chatTools).sort()).toEqual([
      'wiki_read',
      'wiki_search',
      'wiki_status',
    ]);
    expect(Object.keys(noLearningTools).sort()).toEqual([
      'wiki_read',
      'wiki_search',
      'wiki_status',
    ]);
    expect(denied).toMatchObject({
      ok: false,
      error: {
        code: 'OUT_OF_SCOPE',
        details: {
          writablePagePrefixes: [`projects/${projectKey}/`],
          suggestedCreatePageIds: [`projects/${projectKey}/overview.md`],
        },
      },
    });
    expect(status).toMatchObject({
      ok: true,
      writablePagePrefixes: [`projects/${projectKey}/`],
      existingScopedPageIds: expect.arrayContaining([
        `projects/${projectKey}/decisions.md`,
        `projects/${projectKey}/index.md`,
      ]),
      suggestedCreatePageIds: [],
    });
  });

  it('updates sections with provenance and prevents linked-page archive', async () => {
    const tools = createSecondBrainTools({
      secondBrain,
      runtime,
      scope,
      settings,
      toolMode: 'agent',
    });
    const pageId = `projects/${projectKey}/decisions.md`;
    const page = await secondBrain.readPage(pageId);
    const update = await executeTool(tools, 'wiki_update', {
      pageId,
      expectedHash: page.hash,
      rationale: 'Confirmed project convention',
      sourceRefs: ['conversation:123'],
      operation: {
        type: 'replace-section',
        heading: 'Naming',
        content: 'Staging models use stg_source__entity.',
      },
    });

    expect(update).toMatchObject({ ok: true, operation: 'replace-section' });
    const updated = await secondBrain.readPage(pageId);
    expect(updated.content).toContain('stg_source__entity');
    expect(updated.content).toContain('second-brain-sources: conversation:123');

    const archive = await executeTool(tools, 'wiki_archive', {
      pageId,
      expectedHash: updated.hash,
      rationale: 'No longer applicable',
    });
    expect(archive).toMatchObject({
      ok: false,
      error: { code: 'INBOUND_LINKS' },
      inboundLinks: [`projects/${projectKey}/overview.md`],
    });
  });

  it.each([
    'api_key = abcdefghijklmnop',
    'postgres://user:password@host/database',
    '-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----',
    'token: sk_abcdefghijkl',
  ])('rejects likely secrets before creating a page', async (secret) => {
    const tools = createSecondBrainTools({
      secondBrain,
      runtime,
      scope,
      settings,
      toolMode: 'agent',
    });
    const result = await executeTool(tools, 'wiki_update', {
      pageId: `projects/${projectKey}/secret.md`,
      rationale: 'Persist a credential',
      sourceRefs: ['conversation:456'],
      operation: {
        type: 'create',
        searchQuery: 'unique credential page',
        content: markdown('Credential', secret),
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: { code: 'INVALID_CONTENT' },
    });
  });

  it('composes one instructions string and gives scoped tools precedence', () => {
    const agentRuntime = composeAgentRuntime(
      {
        secondBrainContext: '## Second Brain\nScoped map',
        secondBrainTools: { wiki_read: 'trusted-wiki-tool' },
        mcpTools: { wiki_read: 'untrusted-collision', external: 'mcp' },
        loadSkillTool: 'load-skill',
      } as any,
      'Base agent instructions',
      { native: 'native-tool' },
    );

    expect(agentRuntime.instructions).toBe(
      'Base agent instructions\n\n## Second Brain\nScoped map',
    );
    expect(agentRuntime.tools).toEqual({
      native: 'native-tool',
      wiki_read: 'trusted-wiki-tool',
      external: 'mcp',
      loadSkill: 'load-skill',
    });
  });
});
