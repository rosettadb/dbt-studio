import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { shell } from 'electron';
import SecondBrainService, {
  normalizeSecondBrainPageId,
} from '../../../../../../src/main/services/ai/secondBrain/secondBrain.service';
import { SecondBrainError } from '../../../../../../src/main/services/ai/secondBrain/secondBrain.types';

const fixedDate = new Date('2026-07-15T10:00:00.000Z');

const markdown = (title: string, body = 'A durable fact.') => `---
type: Knowledge Note
id: ${title.toLowerCase().replace(/\s+/gu, '-')}
title: ${title}
description: ${title} durable knowledge.
scope: global
updated_by: user
sources: []
---

# ${title}

${body}
`;

describe('SecondBrainService', () => {
  let temporaryDirectory: string;
  let rootPath: string;
  let service: SecondBrainService;
  let idCounter: number;

  const createId = () => {
    idCounter += 1;
    return `00000000-0000-4000-8000-${String(idCounter).padStart(12, '0')}`;
  };

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-second-brain-'),
    );
    rootPath = path.join(temporaryDirectory, 'second-brain');
    idCounter = 0;
    service = new SecondBrainService({
      rootPath,
      now: () => fixedDate,
      createId,
    });
  });

  afterEach(async () => {
    await fs.remove(temporaryDirectory);
  });

  it('opens only the initialized portable wiki folder', async () => {
    const openPath = shell.openPath as jest.Mock;
    openPath.mockResolvedValue('');

    await expect(service.openWikiFolder()).rejects.toMatchObject({
      code: 'NOT_INITIALIZED',
    });
    expect(openPath).not.toHaveBeenCalled();

    await service.initializeRoot();
    await service.openWikiFolder();

    expect(openPath).toHaveBeenCalledTimes(1);
    expect(openPath).toHaveBeenCalledWith(path.join(rootPath, 'wiki'));
  });

  it('bootstraps an idempotent editable wiki with memory.md as entry page', async () => {
    const firstStatus = await service.initializeRoot();
    expect(firstStatus).toMatchObject({
      initialized: true,
      pageCount: 9,
      layoutVersion: 'okf-v0.1',
      okfVersion: '0.1',
      stateVersion: 2,
    });
    expect(await fs.pathExists(path.join(rootPath, 'wiki', 'memory.md'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(rootPath, 'wiki', 'projects'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(rootPath, 'state.json'))).toBe(true);
    expect(await fs.pathExists(path.join(rootPath, 'revisions'))).toBe(true);

    const memory = await service.readPage('memory.md');
    await fs.writeFile(
      path.join(rootPath, 'wiki', 'memory.md'),
      memory.content.replace('compact navigation map', 'user-owned map'),
      'utf8',
    );

    await service.initializeRoot();
    expect((await service.readPage('memory.md')).content).toContain(
      'user-owned map',
    );
  });

  it.each([
    '../secret.md',
    '/absolute.md',
    'projects\\secret.md',
    'archive/secret.md',
    '.meta/secret.md',
    'projects//secret.md',
    'projects/secret.txt',
    'C:/secret.md',
    'topics/CON.md',
    'Topics/secret.md',
    'topics/%2e%2e/secret.md',
    'topics/secret\u202emd',
    'topics/e\u0301.md',
  ])('rejects unsafe page ID %s', (pageId) => {
    expect(() => normalizeSecondBrainPageId(pageId)).toThrow(SecondBrainError);
  });

  it('creates, reads, revises, and restores pages with optimistic hashes', async () => {
    await service.initializeRoot();
    const created = await service.writePage({
      pageId: 'topics/testing.md',
      content: markdown('Testing'),
      actor: 'user',
    });
    const updated = await service.writePage({
      pageId: created.pageId,
      content: markdown('Testing', 'Updated durable fact.'),
      expectedHash: created.hash,
      actor: 'agent',
    });

    await expect(
      service.writePage({
        pageId: created.pageId,
        content: markdown('Testing', 'Stale edit.'),
        expectedHash: created.hash,
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });

    const revisions = await service.listRevisions(created.pageId);
    expect(revisions).toHaveLength(1);
    const restored = await service.restoreRevision({
      pageId: created.pageId,
      revisionId: revisions[0].revisionId,
      expectedHash: updated.hash,
      actor: 'user',
    });
    expect(restored.content).toContain('A durable fact.');
  });

  it('serializes concurrent writes so only one stale hash can succeed', async () => {
    await service.initializeRoot();
    const page = await service.writePage({
      pageId: 'topics/concurrency.md',
      content: markdown('Concurrency'),
      actor: 'user',
    });

    const results = await Promise.allSettled([
      service.writePage({
        pageId: page.pageId,
        content: markdown('Concurrency', 'First update.'),
        expectedHash: page.hash,
        actor: 'agent',
      }),
      service.writePage({
        pageId: page.pageId,
        content: markdown('Concurrency', 'Second update.'),
        expectedHash: page.hash,
        actor: 'agent',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === 'rejected',
    );
    expect(rejected?.reason).toMatchObject({ code: 'CONFLICT' });
  });

  it('archives instead of deleting and removes the page from active listings', async () => {
    await service.initializeRoot();
    const page = await service.writePage({
      pageId: 'topics/archive-me.md',
      content: markdown('Archive me'),
      actor: 'user',
    });

    await service.archivePage({
      pageId: page.pageId,
      expectedHash: page.hash,
      actor: 'user',
    });

    await expect(service.readPage(page.pageId)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
    expect(
      await fs.pathExists(path.join(rootPath, 'archive', page.pageId)),
    ).toBe(true);
    expect(
      (await service.listPages()).map((item) => item.pageId),
    ).not.toContain(page.pageId);
  });

  it('lists, reads, and restores archived pages through page IDs only', async () => {
    await service.initializeRoot();
    const page = await service.writePage({
      pageId: 'topics/managed-archive.md',
      content: markdown('Managed archive'),
      actor: 'user',
    });
    await service.archivePage({
      pageId: page.pageId,
      expectedHash: page.hash,
      actor: 'user',
    });

    expect(await service.listManagedPages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          pageId: page.pageId,
          archived: true,
        }),
      ]),
    );
    const archived = await service.readArchivedPage(page.pageId);
    expect(archived).toMatchObject({ archived: true, readOnly: true });

    const restored = await service.restoreArchivedPage(
      page.pageId,
      archived.hash,
    );
    expect(restored.pageId).toBe(page.pageId);
    expect(
      (await service.listManagedPages()).find(
        (item) => item.pageId === page.pageId,
      )?.archived,
    ).toBe(false);
  });

  it('provides bounded management search and read-only revision content', async () => {
    await service.initializeRoot();
    const created = await service.writePage({
      pageId: 'topics/customer-metrics.md',
      content: markdown('Customer metrics', 'Use retained customer revenue.'),
      actor: 'user',
    });
    await service.writePage({
      pageId: created.pageId,
      content: markdown('Customer metrics', 'Use net customer revenue.'),
      expectedHash: created.hash,
      actor: 'user',
    });

    expect(await service.searchManagedPages('net customer')).toEqual([
      expect.objectContaining({ pageId: created.pageId }),
    ]);
    const [revision] = await service.listRevisions(created.pageId);
    const content = await service.readRevision(
      created.pageId,
      revision.revisionId,
    );
    expect(content.content).toContain('retained customer revenue');
  });

  it('rejects symlink escapes', async () => {
    await service.initializeRoot();
    const outside = path.join(temporaryDirectory, 'outside');
    await fs.ensureDir(outside);
    await nodeFs.symlink(
      outside,
      path.join(rootPath, 'wiki', 'projects', 'escape'),
    );

    await expect(
      service.writePage({
        pageId: 'projects/escape/stolen.md',
        content: markdown('Stolen'),
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'SYMLINK_NOT_ALLOWED' });
  });

  it('rejects hard-linked Markdown files', async () => {
    await service.initializeRoot();
    const outside = path.join(temporaryDirectory, 'outside.md');
    await fs.writeFile(outside, markdown('Outside'), 'utf8');
    await nodeFs.link(
      outside,
      path.join(rootPath, 'wiki', 'topics', 'linked.md'),
    );

    await expect(service.readPage('topics/linked.md')).rejects.toMatchObject({
      code: 'HARD_LINK_NOT_ALLOWED',
    });
  });

  it('enforces page and memory.md line budgets', async () => {
    const limitedService = new SecondBrainService({
      rootPath,
      maxPageBytes: 1024,
      now: () => fixedDate,
      createId,
    });
    await limitedService.initializeRoot();

    await expect(
      limitedService.writePage({
        pageId: 'topics/large.md',
        content: markdown('Large', 'x'.repeat(2000)),
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });

    const memory = await limitedService.readPage('memory.md');
    await expect(
      limitedService.writePage({
        pageId: 'memory.md',
        content: markdown(
          'Second Brain',
          Array.from({ length: 201 }, (_, index) => `line ${index}`).join('\n'),
        ),
        expectedHash: memory.hash,
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
  });

  it('enforces the total wiki budget without creating a failed revision', async () => {
    await service.initializeRoot();
    const page = await service.writePage({
      pageId: 'topics/budget.md',
      content: markdown('Budget'),
      actor: 'user',
    });
    const currentStatus = await service.getStatus();
    const limitedService = new SecondBrainService({
      rootPath,
      maxTotalBytes: currentStatus.totalBytes + 10,
      now: () => fixedDate,
      createId,
    });

    await expect(
      limitedService.writePage({
        pageId: page.pageId,
        content: markdown('Budget', 'x'.repeat(100)),
        expectedHash: page.hash,
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'BUDGET_EXCEEDED' });
    expect(await limitedService.listRevisions(page.pageId)).toHaveLength(0);
  });

  it('backs up malformed state and rebuilds it during initialization', async () => {
    await service.initializeRoot();
    await fs.writeFile(path.join(rootPath, 'state.json'), '{broken', 'utf8');

    const status = await service.initializeRoot();
    const backups = await fs.readdir(
      path.join(rootPath, 'revisions', 'state-backups'),
    );

    expect(status.initialized).toBe(true);
    expect(backups).toHaveLength(1);
    expect((await service.readStateFile())?.version).toBe(2);
  });

  it('generates deterministic OKF indexes and protects reserved pages', async () => {
    await service.initializeRoot();
    const rootIndex = await service.readPage('index.md');
    expect(rootIndex.frontmatter).toEqual({ okf_version: '0.1' });
    expect(rootIndex.content).toContain('[Second Brain](memory.md)');

    await service.writePage({
      pageId: 'topics/metrics.md',
      content: markdown('Metrics'),
      actor: 'user',
    });
    const firstIndex = (await service.readPage('topics/index.md')).content;
    expect(firstIndex.startsWith('# Topics\n')).toBe(true);
    expect(firstIndex).toContain('[Metrics](metrics.md)');

    await service.initializeRoot();
    expect((await service.readPage('topics/index.md')).content).toBe(
      firstIndex,
    );
    await expect(
      service.writePage({
        pageId: 'topics/index.md',
        content: '# Poisoned index',
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'GENERATED_PAGE_READ_ONLY' });
  });

  it('requires OKF type frontmatter for every concept', async () => {
    await service.initializeRoot();
    await expect(
      service.writePage({
        pageId: 'topics/missing-type.md',
        content: '---\ntitle: Missing type\n---\n\n# Missing type\n',
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FRONTMATTER' });
  });

  it('preserves unknown OKF extensions and rejects YAML aliases', async () => {
    await service.initializeRoot();
    const page = await service.writePage({
      pageId: 'topics/extensions.md',
      content: markdown('Extensions').replace(
        'description: Extensions durable knowledge.',
        'description: Extensions durable knowledge.\nx-dbt-owner: finance',
      ),
      actor: 'user',
    });
    expect(page.frontmatter['x-dbt-owner']).toBe('finance');
    expect(page.content).toContain('x-dbt-owner: finance');

    await expect(
      service.writePage({
        pageId: 'topics/alias.md',
        content:
          '---\ntype: &kind Topic\ntitle: Alias\ndescription: *kind\n---\n\n# Alias\n',
        actor: 'user',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_FRONTMATTER' });
  });

  it('rejects an unsupported OKF bundle version before initialization writes', async () => {
    await fs.ensureDir(path.join(rootPath, 'wiki'));
    await fs.writeFile(
      path.join(rootPath, 'wiki', 'index.md'),
      '---\nokf_version: "9.0"\n---\n\n# Future bundle\n',
      'utf8',
    );

    await expect(service.initializeRoot()).rejects.toMatchObject({
      code: 'UNSUPPORTED_BUNDLE_VERSION',
    });
    expect(await fs.pathExists(path.join(rootPath, 'wiki', 'memory.md'))).toBe(
      false,
    );
  });
});
