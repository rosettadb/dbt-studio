/* eslint-disable class-methods-use-this, no-await-in-loop, no-continue, no-restricted-syntax */
import { createHash, randomBytes } from 'crypto';
import { app } from 'electron';
import fs from 'fs-extra';
import path from 'path';
import {
  SECOND_BRAIN_DIRECTORY,
  SECOND_BRAIN_LOGS_DIRECTORY,
  SECOND_BRAIN_SOURCES_DIRECTORY,
} from './secondBrainPolicy';

export const WIKI_MEMORY_SUPPORT_SCHEMA_VERSION = 1 as const;
const MANIFEST_FILE_NAMES = {
  sessions: 'chat-sessions.json',
  analytics: 'analytics.json',
  projects: 'dbt-projects.json',
  application: 'application.json',
  notebooks: 'notebooks.json',
  git: 'git.json',
  wiki: 'wiki.json',
} as const;
const LOG_FILE = 'refresh-current.jsonl';
const DEFAULT_MAX_LOG_BYTES = 1024 * 1024;
const DEFAULT_MAX_LOG_FILES = 5;
const DEFAULT_MAX_LOG_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const MAX_MANIFEST_BYTES = 64 * 1024;
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_-]{0,63}$/u;
const SAFE_EVENT_NAME = /^[a-z][a-z0-9-]{0,63}$/u;
export type WikiMemorySourceKind = keyof typeof MANIFEST_FILE_NAMES;
export type WikiMemorySourceResult =
  | 'unchanged'
  | 'completed'
  | 'partial'
  | 'failed'
  | 'cancelled';
const SOURCE_RESULTS = new Set<WikiMemorySourceResult>([
  'unchanged',
  'completed',
  'partial',
  'failed',
  'cancelled',
]);

export type WikiMemorySourceRecord = {
  sourceKind: WikiMemorySourceKind;
  lastAttemptedAt: string;
  lastSuccessfulAt?: string;
  itemCount: number;
  characterCount: number;
  aggregateHash: string;
  changed: boolean;
  truncated: boolean;
  result: WikiMemorySourceResult;
  safeErrorCode?: string;
  derivedPageIds: string[];
  operationsApplied: number;
};

type WikiMemorySourceManifest = {
  schemaVersion: typeof WIKI_MEMORY_SUPPORT_SCHEMA_VERSION;
  sourceKind: WikiMemorySourceKind;
  updatedAt: string;
  entries: WikiMemorySourceRecord[];
};

export type WikiMemoryDiagnosticEvent = {
  operationId?: string;
  event: string;
  stage?: string;
  durationMs?: number;
  sourceKind?: WikiMemorySourceKind;
  itemsCollected?: number;
  operationsProposed?: number;
  operationsApplied?: number;
  operationsSkipped?: number;
  operationsFailed?: number;
  truncated?: boolean;
  cancelled?: boolean;
  errorCode?: string;
};

export type WikiMemorySupportStatus = {
  sources: WikiMemorySourceRecord[];
  diagnosticEventCount: number;
  diagnosticBytes: number;
  retentionDays: number;
  maxLogFiles: number;
  maxLogBytes: number;
};

export type WikiMemorySupportExport = {
  schemaVersion: typeof WIKI_MEMORY_SUPPORT_SCHEMA_VERSION;
  exportedAt: string;
  sources: WikiMemorySourceRecord[];
  diagnostics: Array<Record<string, unknown>>;
};

type WikiMemorySupportOptions = {
  rootPath?: string;
  now?: () => Date;
  maxLogBytes?: number;
  maxLogFiles?: number;
  maxLogAgeMs?: number;
  canPersist?: () => Promise<boolean>;
};

const isSourceKind = (value: string): value is WikiMemorySourceKind =>
  Object.prototype.hasOwnProperty.call(MANIFEST_FILE_NAMES, value);

const hashIdentifier = (key: Buffer, value: string): string =>
  createHash('sha256').update(key).update('\0').update(value).digest('hex');

export default class WikiMemorySupportService {
  private readonly rootPath: string;

  private readonly now: () => Date;

  private readonly maxLogBytes: number;

  private readonly maxLogFiles: number;

  private readonly maxLogAgeMs: number;

  private readonly canPersist: () => Promise<boolean>;

  private operationLock: Promise<void> = Promise.resolve();

  constructor(options: WikiMemorySupportOptions = {}) {
    this.rootPath = path.resolve(
      options.rootPath ??
        path.join(app.getPath('userData'), SECOND_BRAIN_DIRECTORY),
    );
    this.now = options.now ?? (() => new Date());
    this.maxLogBytes = options.maxLogBytes ?? DEFAULT_MAX_LOG_BYTES;
    this.maxLogFiles = options.maxLogFiles ?? DEFAULT_MAX_LOG_FILES;
    this.maxLogAgeMs = options.maxLogAgeMs ?? DEFAULT_MAX_LOG_AGE_MS;
    this.canPersist = options.canPersist ?? (async () => true);
  }

  public opaqueId(value: string): Promise<string> {
    return this.withLock(async () => {
      const key = await this.loadOrCreateIdentifierKey();
      return hashIdentifier(key, value);
    });
  }

  public async recordSource(record: WikiMemorySourceRecord): Promise<void> {
    if (!(await this.canPersist())) return;
    await this.withLock(async () => {
      await this.ensureSupportRoots();
      const existing = await this.readManifest(record.sourceKind);
      const normalized = this.normalizeSourceRecord(record, existing);
      const manifest: WikiMemorySourceManifest = {
        schemaVersion: WIKI_MEMORY_SUPPORT_SCHEMA_VERSION,
        sourceKind: record.sourceKind,
        updatedAt: this.now().toISOString(),
        entries: [normalized],
      };
      const content = `${JSON.stringify(manifest, null, 2)}\n`;
      if (Buffer.byteLength(content, 'utf8') > MAX_MANIFEST_BYTES) return;
      await this.atomicWrite(this.manifestPath(record.sourceKind), content);
    });
  }

  public async appendDiagnostic(
    input: WikiMemoryDiagnosticEvent,
  ): Promise<void> {
    if (!(await this.canPersist())) return;
    await this.withLock(async () => {
      if (!SAFE_EVENT_NAME.test(input.event)) return;
      await this.ensureSupportRoots();
      await this.pruneLogs();
      const event = this.sanitizeDiagnostic(input);
      const line = `${JSON.stringify(event)}\n`;
      const currentPath = this.currentLogPath();
      await this.assertSafeFileIfExists(currentPath);
      const currentBytes = (await fs.pathExists(currentPath))
        ? (await fs.stat(currentPath)).size
        : 0;
      if (currentBytes + Buffer.byteLength(line, 'utf8') > this.maxLogBytes) {
        await this.rotateLogs();
      }
      await fs.appendFile(currentPath, line, { encoding: 'utf8', mode: 0o600 });
      await this.pruneLogs();
    });
  }

  public async getStatus(): Promise<WikiMemorySupportStatus> {
    return this.withLock(async () => {
      const sources: WikiMemorySourceRecord[] = [];
      for (const sourceKind of Object.keys(MANIFEST_FILE_NAMES)) {
        if (!isSourceKind(sourceKind)) continue;
        const manifest = await this.readManifest(sourceKind);
        if (manifest?.entries[0]) sources.push(manifest.entries[0]);
      }
      const diagnostics = await this.readDiagnostics();
      return {
        sources: sources.sort((left, right) =>
          left.sourceKind.localeCompare(right.sourceKind),
        ),
        diagnosticEventCount: diagnostics.events.length,
        diagnosticBytes: diagnostics.bytes,
        retentionDays: Math.floor(this.maxLogAgeMs / (24 * 60 * 60 * 1000)),
        maxLogFiles: this.maxLogFiles,
        maxLogBytes: this.maxLogBytes,
      };
    });
  }

  public async clear(): Promise<void> {
    await this.withLock(async () => {
      await this.removeContainedDirectory(this.sourcesRoot());
      await this.removeContainedDirectory(this.logsRoot());
    });
  }

  public async buildExport(): Promise<WikiMemorySupportExport> {
    return this.withLock(async () => {
      const sources: WikiMemorySourceRecord[] = [];
      for (const sourceKind of Object.keys(MANIFEST_FILE_NAMES)) {
        if (!isSourceKind(sourceKind)) continue;
        const manifest = await this.readManifest(sourceKind);
        if (manifest?.entries[0]) sources.push(manifest.entries[0]);
      }
      const diagnostics = await this.readDiagnostics();
      return {
        schemaVersion: WIKI_MEMORY_SUPPORT_SCHEMA_VERSION,
        exportedAt: this.now().toISOString(),
        sources,
        diagnostics: diagnostics.events,
      };
    });
  }

  public async writeExport(filePath: string): Promise<void> {
    const payload = await this.buildExport();
    await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
  }

  private normalizeSourceRecord(
    record: WikiMemorySourceRecord,
    existing?: WikiMemorySourceManifest,
  ): WikiMemorySourceRecord {
    const lastSuccessfulAt =
      record.lastSuccessfulAt ?? existing?.entries[0]?.lastSuccessfulAt;
    return {
      sourceKind: record.sourceKind,
      lastAttemptedAt: record.lastAttemptedAt,
      ...(lastSuccessfulAt ? { lastSuccessfulAt } : {}),
      itemCount: Math.max(0, Math.floor(record.itemCount)),
      characterCount: Math.max(0, Math.floor(record.characterCount)),
      aggregateHash: /^[a-f0-9]{64}$/u.test(record.aggregateHash)
        ? record.aggregateHash
        : '',
      changed: Boolean(record.changed),
      truncated: Boolean(record.truncated),
      result: record.result,
      ...(record.safeErrorCode && SAFE_ERROR_CODE.test(record.safeErrorCode)
        ? { safeErrorCode: record.safeErrorCode }
        : {}),
      derivedPageIds: record.derivedPageIds
        .filter((pageId) => /^[a-z0-9][a-z0-9/_-]*\.md$/u.test(pageId))
        .slice(0, 24),
      operationsApplied: Math.max(0, Math.floor(record.operationsApplied)),
    };
  }

  private sanitizeDiagnostic(
    input: WikiMemoryDiagnosticEvent,
  ): Record<string, unknown> {
    const numeric = (value: number | undefined) =>
      value === undefined ? undefined : Math.max(0, Math.floor(value));
    return {
      schemaVersion: WIKI_MEMORY_SUPPORT_SCHEMA_VERSION,
      timestamp: this.now().toISOString(),
      event: input.event,
      ...(input.operationId && /^[a-zA-Z0-9-]{1,100}$/u.test(input.operationId)
        ? { operationId: input.operationId }
        : {}),
      ...(input.stage && SAFE_EVENT_NAME.test(input.stage)
        ? { stage: input.stage }
        : {}),
      ...(input.sourceKind ? { sourceKind: input.sourceKind } : {}),
      ...(numeric(input.durationMs) !== undefined
        ? { durationMs: numeric(input.durationMs) }
        : {}),
      ...(numeric(input.itemsCollected) !== undefined
        ? { itemsCollected: numeric(input.itemsCollected) }
        : {}),
      ...(numeric(input.operationsProposed) !== undefined
        ? { operationsProposed: numeric(input.operationsProposed) }
        : {}),
      ...(numeric(input.operationsApplied) !== undefined
        ? { operationsApplied: numeric(input.operationsApplied) }
        : {}),
      ...(numeric(input.operationsSkipped) !== undefined
        ? { operationsSkipped: numeric(input.operationsSkipped) }
        : {}),
      ...(numeric(input.operationsFailed) !== undefined
        ? { operationsFailed: numeric(input.operationsFailed) }
        : {}),
      ...(input.truncated !== undefined
        ? { truncated: Boolean(input.truncated) }
        : {}),
      ...(input.cancelled !== undefined
        ? { cancelled: Boolean(input.cancelled) }
        : {}),
      ...(input.errorCode && SAFE_ERROR_CODE.test(input.errorCode)
        ? { errorCode: input.errorCode }
        : {}),
    };
  }

  private async readManifest(
    sourceKind: WikiMemorySourceKind,
  ): Promise<WikiMemorySourceManifest | undefined> {
    const filePath = this.manifestPath(sourceKind);
    if (!(await fs.pathExists(filePath))) return undefined;
    try {
      const stat = await fs.lstat(filePath);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.size > MAX_MANIFEST_BYTES
      ) {
        return undefined;
      }
      const parsed = JSON.parse(
        await fs.readFile(filePath, 'utf8'),
      ) as WikiMemorySourceManifest;
      if (
        parsed.schemaVersion !== WIKI_MEMORY_SUPPORT_SCHEMA_VERSION ||
        parsed.sourceKind !== sourceKind ||
        !Array.isArray(parsed.entries)
      ) {
        return undefined;
      }
      const entry = parsed.entries[0];
      if (
        !entry ||
        entry.sourceKind !== sourceKind ||
        typeof entry.lastAttemptedAt !== 'string' ||
        typeof entry.itemCount !== 'number' ||
        typeof entry.characterCount !== 'number' ||
        typeof entry.aggregateHash !== 'string' ||
        typeof entry.changed !== 'boolean' ||
        typeof entry.truncated !== 'boolean' ||
        !SOURCE_RESULTS.has(entry.result) ||
        !Array.isArray(entry.derivedPageIds) ||
        typeof entry.operationsApplied !== 'number'
      ) {
        return undefined;
      }
      return { ...parsed, entries: [this.normalizeSourceRecord(entry)] };
    } catch {
      return undefined;
    }
  }

  private async readDiagnostics(): Promise<{
    events: Array<Record<string, unknown>>;
    bytes: number;
  }> {
    if (!(await fs.pathExists(this.logsRoot())))
      return { events: [], bytes: 0 };
    const entries = (await fs.readdir(this.logsRoot(), { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          /^refresh-(?:current|\d+)\.jsonl$/u.test(entry.name),
      )
      .sort((left, right) => left.name.localeCompare(right.name));
    const events: Array<Record<string, unknown>> = [];
    let bytes = 0;
    for (const entry of entries.slice(-this.maxLogFiles)) {
      const filePath = path.join(this.logsRoot(), entry.name);
      const stat = await fs.lstat(filePath);
      if (stat.isSymbolicLink() || stat.size > this.maxLogBytes) continue;
      bytes += stat.size;
      const content = await fs.readFile(filePath, 'utf8');
      for (const line of content.split('\n')) {
        if (!line || events.length >= 5_000) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const sanitized = this.sanitizeStoredDiagnostic(
              parsed as Record<string, unknown>,
            );
            if (sanitized) events.push(sanitized);
          }
        } catch {
          // A partial final line is ignored and never blocks support status.
        }
      }
    }
    return { events, bytes };
  }

  private async rotateLogs(): Promise<void> {
    const currentPath = this.currentLogPath();
    if (!(await fs.pathExists(currentPath))) return;
    const rotatedPath = path.join(
      this.logsRoot(),
      `refresh-${this.now().getTime()}.jsonl`,
    );
    await fs.rename(currentPath, rotatedPath);
  }

  private sanitizeStoredDiagnostic(
    parsed: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (
      parsed.schemaVersion !== WIKI_MEMORY_SUPPORT_SCHEMA_VERSION ||
      typeof parsed.timestamp !== 'string' ||
      typeof parsed.event !== 'string' ||
      !SAFE_EVENT_NAME.test(parsed.event)
    ) {
      return undefined;
    }
    const output: Record<string, unknown> = {
      schemaVersion: WIKI_MEMORY_SUPPORT_SCHEMA_VERSION,
      timestamp: parsed.timestamp.slice(0, 40),
      event: parsed.event,
    };
    const safeStrings = ['operationId', 'stage', 'sourceKind', 'errorCode'];
    for (const key of safeStrings) {
      const value = parsed[key];
      if (typeof value !== 'string') continue;
      if (key === 'operationId' && /^[a-zA-Z0-9-]{1,100}$/u.test(value)) {
        output[key] = value;
      } else if (key === 'sourceKind' && isSourceKind(value)) {
        output[key] = value;
      } else if (key === 'errorCode' && SAFE_ERROR_CODE.test(value)) {
        output[key] = value;
      } else if (key === 'stage' && SAFE_EVENT_NAME.test(value)) {
        output[key] = value;
      }
    }
    const safeNumbers = [
      'durationMs',
      'itemsCollected',
      'operationsProposed',
      'operationsApplied',
      'operationsSkipped',
      'operationsFailed',
    ];
    for (const key of safeNumbers) {
      const value = parsed[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        output[key] = Math.floor(value);
      }
    }
    for (const key of ['truncated', 'cancelled']) {
      if (typeof parsed[key] === 'boolean') output[key] = parsed[key];
    }
    return output;
  }

  private async pruneLogs(): Promise<void> {
    if (!(await fs.pathExists(this.logsRoot()))) return;
    const cutoff = this.now().getTime() - this.maxLogAgeMs;
    const entries = (await fs.readdir(this.logsRoot(), { withFileTypes: true }))
      .filter(
        (entry) => entry.isFile() && /^refresh-\d+\.jsonl$/u.test(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        timestamp: Number(entry.name.match(/\d+/u)?.[0] ?? 0),
      }))
      .sort((left, right) => right.timestamp - left.timestamp);
    for (const [index, entry] of entries.entries()) {
      if (entry.timestamp < cutoff || index >= this.maxLogFiles - 1) {
        await fs.remove(path.join(this.logsRoot(), entry.name));
      }
    }
  }

  private async ensureSupportRoots(): Promise<void> {
    if (await fs.pathExists(this.rootPath)) {
      const rootStat = await fs.lstat(this.rootPath);
      if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
        throw new Error('Unsafe Wiki Memory support root.');
      }
    } else {
      await fs.mkdir(this.rootPath, { recursive: true, mode: 0o700 });
    }
    await this.ensureContainedDirectory(this.sourcesRoot());
    await this.ensureContainedDirectory(this.logsRoot());
  }

  private async assertSafeFileIfExists(filePath: string): Promise<void> {
    if (!(await fs.pathExists(filePath))) return;
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink > 1) {
      throw new Error('Unsafe Wiki Memory support file.');
    }
  }

  private async ensureContainedDirectory(directory: string): Promise<void> {
    if (await fs.pathExists(directory)) {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        throw new Error('Unsafe Wiki Memory support directory.');
      }
      return;
    }
    await fs.mkdir(directory, { mode: 0o700 });
  }

  private async removeContainedDirectory(directory: string): Promise<void> {
    if (!(await fs.pathExists(directory))) return;
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error('Unsafe Wiki Memory support directory.');
    }
    await fs.remove(directory);
  }

  private async loadOrCreateIdentifierKey(): Promise<Buffer> {
    await this.ensureSupportRoots();
    const keyPath = path.join(this.sourcesRoot(), '.identifier-key');
    if (await fs.pathExists(keyPath)) {
      const stat = await fs.lstat(keyPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) {
        throw new Error('Invalid Wiki Memory identifier key.');
      }
      return fs.readFile(keyPath);
    }
    const key = randomBytes(32);
    await fs.writeFile(keyPath, key, { mode: 0o600, flag: 'wx' });
    return key;
  }

  private async atomicWrite(filePath: string, content: string): Promise<void> {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, content, {
      encoding: 'utf8',
      mode: 0o600,
      flag: 'wx',
    });
    try {
      await fs.rename(temporaryPath, filePath);
    } finally {
      await fs.remove(temporaryPath);
    }
  }

  private withLock<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationLock.then(operation, operation);
    this.operationLock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private sourcesRoot(): string {
    return path.join(this.rootPath, SECOND_BRAIN_SOURCES_DIRECTORY);
  }

  private logsRoot(): string {
    return path.join(this.rootPath, SECOND_BRAIN_LOGS_DIRECTORY);
  }

  private manifestPath(sourceKind: WikiMemorySourceKind): string {
    return path.join(this.sourcesRoot(), MANIFEST_FILE_NAMES[sourceKind]);
  }

  private currentLogPath(): string {
    return path.join(this.logsRoot(), LOG_FILE);
  }
}
