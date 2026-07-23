/* eslint-disable no-await-in-loop */
import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import WikiMemorySupportService from '../../../../../../src/main/services/ai/secondBrain/wikiMemorySupport.service';

describe('WikiMemorySupportService', () => {
  let temporaryDirectory: string;
  let rootPath: string;
  let nowMs: number;
  let service: WikiMemorySupportService;

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'wiki-memory-support-'),
    );
    rootPath = path.join(temporaryDirectory, 'second-brain');
    nowMs = Date.parse('2026-07-22T12:00:00.000Z');
    service = new WikiMemorySupportService({
      rootPath,
      now: () => new Date(nowMs),
      maxLogBytes: 320,
      maxLogFiles: 3,
      maxLogAgeMs: 2 * 24 * 60 * 60 * 1000,
    });
  });

  afterEach(async () => fs.remove(temporaryDirectory));

  it('persists only the bounded source contract and preserves last success', async () => {
    await service.recordSource({
      sourceKind: 'sessions',
      lastAttemptedAt: '2026-07-22T12:00:00.000Z',
      lastSuccessfulAt: '2026-07-22T12:00:00.000Z',
      itemCount: 4,
      characterCount: 1200,
      aggregateHash: 'a'.repeat(64),
      changed: true,
      truncated: false,
      result: 'completed',
      derivedPageIds: ['topics/preferences.md', '../../secret.md'],
      operationsApplied: 1,
    });
    nowMs += 1000;
    await service.recordSource({
      sourceKind: 'sessions',
      lastAttemptedAt: '2026-07-22T12:00:01.000Z',
      itemCount: 0,
      characterCount: 0,
      aggregateHash: 'b'.repeat(64),
      changed: true,
      truncated: false,
      result: 'partial',
      safeErrorCode: 'SOURCE_FAILED',
      derivedPageIds: [],
      operationsApplied: 0,
    });

    const status = await service.getStatus();
    expect(status.sources).toEqual([
      expect.objectContaining({
        sourceKind: 'sessions',
        lastSuccessfulAt: '2026-07-22T12:00:00.000Z',
        result: 'partial',
        safeErrorCode: 'SOURCE_FAILED',
        derivedPageIds: [],
      }),
    ]);
    const stored = await fs.readFile(
      path.join(rootPath, 'sources', 'chat-sessions.json'),
      'utf8',
    );
    expect(stored).not.toContain('secret.md');
    expect(stored).not.toContain('chat body');
  });

  it('writes allowlisted diagnostics, rotates them, and ignores raw fields', async () => {
    for (let index = 0; index < 12; index += 1) {
      nowMs += 1000;
      await service.appendDiagnostic({
        operationId: `operation-${index}`,
        event: 'refresh-completed',
        stage: 'completed',
        itemsCollected: index,
        errorCode: 'SAFE_CODE',
        // @ts-expect-error raw content is not part of the diagnostic contract
        sql: 'select password from credentials',
      });
    }

    const status = await service.getStatus();
    const files = await fs.readdir(path.join(rootPath, 'logs'));
    expect(files.length).toBeLessThanOrEqual(3);
    expect(status.diagnosticEventCount).toBeGreaterThan(0);
    const stored = (
      await Promise.all(
        files.map((file) =>
          fs.readFile(path.join(rootPath, 'logs', file), 'utf8'),
        ),
      )
    ).join('\n');
    expect(stored).not.toContain('select password');
    expect(stored).not.toContain('sql');
  });

  it('tolerates corrupt support files and clears only support data', async () => {
    await fs.ensureDir(path.join(rootPath, 'wiki'));
    await fs.writeFile(path.join(rootPath, 'wiki', 'memory.md'), 'knowledge');
    await fs.writeJson(path.join(rootPath, 'state.json'), { cursor: 12 });
    await fs.ensureDir(path.join(rootPath, 'sources'));
    await fs.writeFile(
      path.join(rootPath, 'sources', 'analytics.json'),
      '{broken',
    );

    await expect(service.getStatus()).resolves.toMatchObject({ sources: [] });
    await service.appendDiagnostic({ event: 'refresh-started' });
    await service.clear();

    expect(await fs.pathExists(path.join(rootPath, 'sources'))).toBe(false);
    expect(await fs.pathExists(path.join(rootPath, 'logs'))).toBe(false);
    expect(
      await fs.readFile(path.join(rootPath, 'wiki', 'memory.md'), 'utf8'),
    ).toBe('knowledge');
    expect(await fs.readJson(path.join(rootPath, 'state.json'))).toEqual({
      cursor: 12,
    });
  });

  it('builds an export from approved records only', async () => {
    await service.recordSource({
      sourceKind: 'git',
      lastAttemptedAt: '2026-07-22T12:00:00.000Z',
      itemCount: 1,
      characterCount: 40,
      aggregateHash: 'c'.repeat(64),
      changed: false,
      truncated: false,
      result: 'unchanged',
      derivedPageIds: [],
      operationsApplied: 0,
    });
    await service.appendDiagnostic({
      operationId: 'operation-1',
      event: 'refresh-completed',
      operationsApplied: 0,
    });

    const exported = await service.buildExport();
    expect(exported.sources).toHaveLength(1);
    expect(exported.diagnostics).toHaveLength(1);
    expect(JSON.stringify(exported)).not.toContain(rootPath);
  });

  it('creates no support data while persistence is disabled', async () => {
    const disabled = new WikiMemorySupportService({
      rootPath,
      canPersist: async () => false,
    });

    await disabled.appendDiagnostic({ event: 'refresh-started' });
    await disabled.recordSource({
      sourceKind: 'analytics',
      lastAttemptedAt: '2026-07-22T12:00:00.000Z',
      itemCount: 0,
      characterCount: 0,
      aggregateHash: 'd'.repeat(64),
      changed: false,
      truncated: false,
      result: 'unchanged',
      derivedPageIds: [],
      operationsApplied: 0,
    });

    expect(await fs.pathExists(path.join(rootPath, 'sources'))).toBe(false);
    expect(await fs.pathExists(path.join(rootPath, 'logs'))).toBe(false);
  });

  it('rejects linked diagnostic targets without touching the external file', async () => {
    const external = path.join(temporaryDirectory, 'external.jsonl');
    await fs.writeFile(external, 'external');
    await fs.ensureDir(path.join(rootPath, 'logs'));
    await fs.ensureDir(path.join(rootPath, 'sources'));
    await fs.symlink(
      external,
      path.join(rootPath, 'logs', 'refresh-current.jsonl'),
    );

    await expect(
      service.appendDiagnostic({ event: 'refresh-started' }),
    ).rejects.toThrow('Unsafe Wiki Memory support file');
    expect(await fs.readFile(external, 'utf8')).toBe('external');
  });
});
