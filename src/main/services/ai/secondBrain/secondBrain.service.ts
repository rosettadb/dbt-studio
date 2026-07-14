/* eslint-disable no-await-in-loop, no-continue, no-restricted-syntax */
import { createHash, randomUUID } from 'crypto';
import { promises as nodeFs } from 'fs';
import type { FileHandle } from 'fs/promises';
import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import yaml from 'js-yaml';
import type {
  SecondBrainArchiveInput,
  SecondBrainFrontmatter,
  SecondBrainPage,
  SecondBrainPageSummary,
  SecondBrainRestoreInput,
  SecondBrainRevisionSummary,
  SecondBrainStatus,
  SecondBrainWriteInput,
} from '../../../../types/backend';
import {
  SECOND_BRAIN_ARCHIVE_DIRECTORY,
  SECOND_BRAIN_BOOTSTRAP_PAGES,
  SECOND_BRAIN_CANONICAL_DIRECTORIES,
  SECOND_BRAIN_DEFAULT_MAX_PAGE_BYTES,
  SECOND_BRAIN_DEFAULT_MAX_TOTAL_BYTES,
  SECOND_BRAIN_DEFAULT_REVISION_LIMIT,
  SECOND_BRAIN_DIRECTORY,
  SECOND_BRAIN_ENTRY_MAX_BYTES,
  SECOND_BRAIN_ENTRY_MAX_LINES,
  SECOND_BRAIN_ENTRY_PAGE,
  SECOND_BRAIN_META_DIRECTORY,
  SECOND_BRAIN_STATE_FILE,
} from './secondBrainPolicy';
import {
  ParsedSecondBrainDocument,
  SecondBrainError,
  SecondBrainServiceOptions,
  SecondBrainState,
} from './secondBrain.types';

const textEncoder = new TextEncoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hashContent = (content: string | Buffer): string =>
  createHash('sha256').update(content).digest('hex');

const normalizeContent = (content: string): string => {
  if (content.includes('\0')) {
    throw new SecondBrainError(
      'INVALID_CONTENT',
      'Second Brain pages cannot contain NUL bytes.',
    );
  }
  return `${content.replace(/(?:\r?\n)+$/u, '')}\n`;
};

export const parseSecondBrainDocument = (
  content: string,
): ParsedSecondBrainDocument => {
  if (!content.startsWith('---\n') && !content.startsWith('---\r\n')) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/u);
  if (!frontmatterMatch) {
    throw new SecondBrainError(
      'INVALID_FRONTMATTER',
      'Markdown frontmatter is missing its closing delimiter.',
    );
  }

  try {
    const parsed = yaml.load(frontmatterMatch[1]);
    if (parsed !== undefined && !isRecord(parsed)) {
      throw new Error('Frontmatter must be a mapping.');
    }
    return {
      frontmatter: (parsed ?? {}) as SecondBrainFrontmatter,
      body: content.slice(frontmatterMatch[0].length),
    };
  } catch (error) {
    throw new SecondBrainError(
      'INVALID_FRONTMATTER',
      `Invalid Markdown frontmatter: ${(error as Error).message}`,
    );
  }
};

export const normalizeSecondBrainPageId = (pageId: string): string => {
  if (
    typeof pageId !== 'string' ||
    pageId.length === 0 ||
    pageId.includes('\0') ||
    pageId.includes('\\') ||
    path.posix.isAbsolute(pageId) ||
    pageId.normalize('NFC') !== pageId ||
    !pageId.toLowerCase().endsWith('.md')
  ) {
    throw new SecondBrainError(
      'INVALID_PAGE_ID',
      'Page IDs must be relative POSIX paths ending in .md.',
    );
  }

  const segments = pageId.split('/');
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === '.' ||
        segment === '..' ||
        segment.startsWith('.') ||
        segment.endsWith('.') ||
        segment.endsWith(' ') ||
        segment.includes(':') ||
        /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu.test(segment) ||
        [...segment].some(
          (character) =>
            character.charCodeAt(0) < 32 || '<>"|?*'.includes(character),
        ),
    ) ||
    segments[0] === SECOND_BRAIN_ARCHIVE_DIRECTORY
  ) {
    throw new SecondBrainError(
      'INVALID_PAGE_ID',
      'Page ID contains a reserved or unsafe path segment.',
    );
  }

  const normalized = path.posix.normalize(pageId);
  if (normalized !== pageId) {
    throw new SecondBrainError(
      'INVALID_PAGE_ID',
      'Page ID must already be normalized.',
    );
  }
  return normalized;
};

export default class SecondBrainService {
  private readonly rootPath: string;

  private readonly maxPageBytes: number;

  private readonly maxTotalBytes: number;

  private readonly revisionLimit: number;

  private readonly now: () => Date;

  private readonly createId: () => string;

  private readonly pageLocks = new Map<string, Promise<void>>();

  private stateLock: Promise<void> = Promise.resolve();

  constructor(options: SecondBrainServiceOptions = {}) {
    this.rootPath = path.resolve(
      options.rootPath ??
        path.join(app.getPath('userData'), SECOND_BRAIN_DIRECTORY),
    );
    this.maxPageBytes =
      options.maxPageBytes ?? SECOND_BRAIN_DEFAULT_MAX_PAGE_BYTES;
    this.maxTotalBytes =
      options.maxTotalBytes ?? SECOND_BRAIN_DEFAULT_MAX_TOTAL_BYTES;
    this.revisionLimit =
      options.revisionLimit ?? SECOND_BRAIN_DEFAULT_REVISION_LIMIT;
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
  }

  public getRootPath(): string {
    return this.rootPath;
  }

  public async initializeRoot(): Promise<SecondBrainStatus> {
    await this.ensureSafeRoot();
    await Promise.all(
      SECOND_BRAIN_CANONICAL_DIRECTORIES.map((directory) =>
        fs.ensureDir(path.join(this.rootPath, directory)),
      ),
    );
    await fs.ensureDir(this.revisionsRoot());
    await fs.ensureDir(this.stateBackupsRoot());

    for (const [pageId, content] of Object.entries(
      SECOND_BRAIN_BOOTSTRAP_PAGES,
    )) {
      const pagePath = await this.resolvePagePath(pageId, false);
      if (!(await fs.pathExists(pagePath))) {
        const normalized = normalizeContent(content);
        this.assertPageBudget(pageId, normalized);
        await this.assertTotalBudget(textEncoder.encode(normalized).byteLength);
        await this.atomicWrite(pagePath, normalized);
      }
    }

    const existingState = await this.readState(true);
    const pages = await this.listPages();
    const state: SecondBrainState = existingState ?? {
      version: 1,
      initializedAt: this.now().toISOString(),
      sourceCursors: {},
      sourceHashes: {},
      pageHashes: {},
    };
    state.pageHashes = Object.fromEntries(
      pages.map((page) => [page.pageId, page.hash]),
    );
    await this.writeState(state);
    return this.getStatus();
  }

  public async getStatus(): Promise<SecondBrainStatus> {
    if (!(await fs.pathExists(this.rootPath))) {
      return {
        initialized: false,
        pageCount: 0,
        totalBytes: 0,
        rootPath: this.rootPath,
      };
    }

    await this.ensureSafeRoot();
    const pages = await this.listPages();
    const state = await this.readState(true);
    const requiredPagesExist = Object.keys(SECOND_BRAIN_BOOTSTRAP_PAGES).every(
      (pageId) => pages.some((page) => page.pageId === pageId),
    );
    return {
      initialized: Boolean(state && requiredPagesExist),
      pageCount: pages.length,
      totalBytes: pages.reduce((total, page) => total + page.sizeBytes, 0),
      rootPath: this.rootPath,
      stateVersion: state?.version,
      lastSuccessfulRefreshAt: state?.lastSuccessfulRefreshAt,
    };
  }

  public async listPages(): Promise<SecondBrainPageSummary[]> {
    if (!(await fs.pathExists(this.rootPath))) return [];
    await this.ensureSafeRoot();
    const pageIds = await this.walkMarkdownPages(this.rootPath, '');
    const pages = await Promise.all(
      pageIds.map((pageId) => this.readPage(pageId)),
    );
    return pages
      .map((page) => ({
        pageId: page.pageId,
        title: page.title,
        hash: page.hash,
        modifiedAt: page.modifiedAt,
        sizeBytes: page.sizeBytes,
        frontmatter: page.frontmatter,
      }))
      .sort((left, right) => left.pageId.localeCompare(right.pageId));
  }

  public async readPage(pageId: string): Promise<SecondBrainPage> {
    const normalizedPageId = normalizeSecondBrainPageId(pageId);
    const pagePath = await this.resolvePagePath(normalizedPageId, true);
    if (!(await fs.pathExists(pagePath))) {
      throw new SecondBrainError('NOT_FOUND', 'Second Brain page not found.', {
        pageId: normalizedPageId,
      });
    }
    await this.assertNoSymlink(pagePath);
    const stat = await fs.stat(pagePath);
    if (!stat.isFile()) {
      throw new SecondBrainError('NOT_FOUND', 'Second Brain page not found.', {
        pageId: normalizedPageId,
      });
    }
    if (stat.size > this.maxPageBytes) {
      throw new SecondBrainError(
        'BUDGET_EXCEEDED',
        'Second Brain page exceeds the configured read limit.',
        { pageId: normalizedPageId, sizeBytes: stat.size },
      );
    }
    const content = await fs.readFile(pagePath, 'utf8');
    const { frontmatter, body } = parseSecondBrainDocument(content);
    return {
      pageId: normalizedPageId,
      title: SecondBrainService.resolveTitle(
        normalizedPageId,
        frontmatter,
        body,
      ),
      content,
      body,
      frontmatter,
      hash: hashContent(content),
      modifiedAt: stat.mtime.toISOString(),
      sizeBytes: stat.size,
    };
  }

  public async writePage(
    input: SecondBrainWriteInput,
  ): Promise<SecondBrainPage> {
    const pageId = normalizeSecondBrainPageId(input.pageId);
    return this.withPageLock(pageId, async () => {
      await this.requireInitializedState();
      const content = normalizeContent(input.content);
      parseSecondBrainDocument(content);
      this.assertPageBudget(pageId, content);
      const pagePath = await this.resolvePagePath(pageId, false);
      const exists = await fs.pathExists(pagePath);
      let previousBytes = 0;
      let previousContent: Buffer | undefined;

      if (exists) {
        await this.assertNoSymlink(pagePath);
        const current = await fs.readFile(pagePath);
        previousContent = current;
        previousBytes = current.byteLength;
        const currentHash = hashContent(current);
        if (!input.expectedHash || input.expectedHash !== currentHash) {
          const stat = await fs.stat(pagePath);
          throw new SecondBrainError(
            'CONFLICT',
            'Second Brain page changed since it was read.',
            {
              pageId,
              currentHash,
              modifiedAt: stat.mtime.toISOString(),
            },
          );
        }
      } else if (input.expectedHash) {
        throw new SecondBrainError(
          'NOT_FOUND',
          'Second Brain page not found.',
          {
            pageId,
          },
        );
      }

      await this.assertTotalBudget(
        textEncoder.encode(content).byteLength - previousBytes,
      );
      if (previousContent) await this.saveRevision(pageId, previousContent);
      await this.atomicWrite(pagePath, content);
      await this.updatePageHash(pageId, hashContent(content));
      return this.readPage(pageId);
    });
  }

  public async archivePage(input: SecondBrainArchiveInput): Promise<void> {
    const pageId = normalizeSecondBrainPageId(input.pageId);
    await this.withPageLock(pageId, async () => {
      await this.requireInitializedState();
      const pagePath = await this.resolvePagePath(pageId, true);
      if (!(await fs.pathExists(pagePath))) {
        throw new SecondBrainError(
          'NOT_FOUND',
          'Second Brain page not found.',
          {
            pageId,
          },
        );
      }
      await this.assertNoSymlink(pagePath);
      const current = await fs.readFile(pagePath);
      const currentHash = hashContent(current);
      if (input.expectedHash !== currentHash) {
        const stat = await fs.stat(pagePath);
        throw new SecondBrainError(
          'CONFLICT',
          'Second Brain page changed since it was read.',
          { pageId, currentHash, modifiedAt: stat.mtime.toISOString() },
        );
      }
      await this.saveRevision(pageId, current);
      const archivePath = await this.resolveInternalPath(
        path.posix.join(SECOND_BRAIN_ARCHIVE_DIRECTORY, pageId),
      );
      if (await fs.pathExists(archivePath)) {
        throw new SecondBrainError(
          'ALREADY_EXISTS',
          'An archived page already exists at this location.',
          { pageId },
        );
      }
      await fs.ensureDir(path.dirname(archivePath));
      await nodeFs.rename(pagePath, archivePath);
      await this.removePageHash(pageId);
    });
  }

  public async listRevisions(
    pageIdInput: string,
  ): Promise<SecondBrainRevisionSummary[]> {
    const pageId = normalizeSecondBrainPageId(pageIdInput);
    const directory = await this.revisionDirectory(pageId);
    if (!(await fs.pathExists(directory))) return [];
    await this.assertNoSymlink(directory);
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const revisions = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() && /^[0-9]+-[0-9a-f-]+\.md$/iu.test(entry.name),
        )
        .map(async (entry) => {
          const revisionPath = path.join(directory, entry.name);
          await this.assertNoSymlink(revisionPath);
          const stat = await fs.stat(revisionPath);
          return {
            revisionId: entry.name.slice(0, -3),
            pageId,
            createdAt: stat.mtime.toISOString(),
            sizeBytes: stat.size,
          };
        }),
    );
    return revisions.sort((left, right) =>
      right.revisionId.localeCompare(left.revisionId),
    );
  }

  public async restoreRevision(
    input: SecondBrainRestoreInput,
  ): Promise<SecondBrainPage> {
    const pageId = normalizeSecondBrainPageId(input.pageId);
    if (!/^[0-9]+-[0-9a-f-]+$/iu.test(input.revisionId)) {
      throw new SecondBrainError('INVALID_PAGE_ID', 'Revision ID is invalid.');
    }
    return this.withPageLock(pageId, async () => {
      await this.requireInitializedState();
      const currentPage = await this.readPage(pageId);
      if (currentPage.hash !== input.expectedHash) {
        throw new SecondBrainError(
          'CONFLICT',
          'Second Brain page changed since it was read.',
          {
            pageId,
            currentHash: currentPage.hash,
            modifiedAt: currentPage.modifiedAt,
          },
        );
      }
      const directory = await this.revisionDirectory(pageId);
      const revisionPath = await this.resolveContainedPath(
        directory,
        `${input.revisionId}.md`,
      );
      if (!(await fs.pathExists(revisionPath))) {
        throw new SecondBrainError('NOT_FOUND', 'Revision not found.', {
          pageId,
          revisionId: input.revisionId,
        });
      }
      await this.assertNoSymlink(revisionPath);
      const revision = await fs.readFile(revisionPath, 'utf8');
      const normalized = normalizeContent(revision);
      parseSecondBrainDocument(normalized);
      this.assertPageBudget(pageId, normalized);
      await this.saveRevision(pageId, Buffer.from(currentPage.content, 'utf8'));
      const pagePath = await this.resolvePagePath(pageId, true);
      await this.atomicWrite(pagePath, normalized);
      await this.updatePageHash(pageId, hashContent(normalized));
      return this.readPage(pageId);
    });
  }

  public async readStateFile(): Promise<SecondBrainState | null> {
    if (!(await fs.pathExists(this.rootPath))) return null;
    await this.ensureSafeRoot();
    return this.readState(true);
  }

  private async ensureSafeRoot(): Promise<void> {
    await fs.ensureDir(this.rootPath);
    const rootStat = await fs.lstat(this.rootPath);
    if (rootStat.isSymbolicLink()) {
      throw new SecondBrainError(
        'SYMLINK_NOT_ALLOWED',
        'Second Brain root cannot be a symbolic link.',
      );
    }
  }

  private async resolvePagePath(
    pageId: string,
    requireRoot: boolean,
  ): Promise<string> {
    const normalized = normalizeSecondBrainPageId(pageId);
    if (requireRoot || (await fs.pathExists(this.rootPath))) {
      await this.ensureSafeRoot();
    }
    return this.resolveContainedPath(this.rootPath, ...normalized.split('/'));
  }

  private async resolveInternalPath(relativePath: string): Promise<string> {
    await this.ensureSafeRoot();
    return this.resolveContainedPath(this.rootPath, ...relativePath.split('/'));
  }

  private async resolveContainedPath(
    basePath: string,
    ...segments: string[]
  ): Promise<string> {
    const candidate = path.resolve(basePath, ...segments);
    const relative = path.relative(this.rootPath, candidate);
    if (
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      throw new SecondBrainError(
        'OUTSIDE_ROOT',
        'Resolved path is outside the Second Brain root.',
      );
    }
    await this.assertExistingAncestorsAreSafe(candidate);
    return candidate;
  }

  private async assertExistingAncestorsAreSafe(
    candidate: string,
  ): Promise<void> {
    if (!(await fs.pathExists(this.rootPath))) return;
    const realRoot = await fs.realpath(this.rootPath);
    const relative = path.relative(this.rootPath, candidate);
    const segments = relative === '' ? [] : relative.split(path.sep);
    let cursor = this.rootPath;
    for (const segment of segments) {
      cursor = path.join(cursor, segment);
      if (!(await fs.pathExists(cursor))) break;
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) {
        throw new SecondBrainError(
          'SYMLINK_NOT_ALLOWED',
          'Symbolic links are not allowed in the Second Brain.',
        );
      }
      const realCursor = await fs.realpath(cursor);
      const realRelative = path.relative(realRoot, realCursor);
      if (
        realRelative === '..' ||
        realRelative.startsWith(`..${path.sep}`) ||
        path.isAbsolute(realRelative)
      ) {
        throw new SecondBrainError(
          'OUTSIDE_ROOT',
          'Resolved path is outside the Second Brain root.',
        );
      }
    }
  }

  private async assertNoSymlink(targetPath: string): Promise<void> {
    await this.assertExistingAncestorsAreSafe(targetPath);
    const stat = await fs.lstat(targetPath);
    if (stat.isSymbolicLink()) {
      throw new SecondBrainError(
        'SYMLINK_NOT_ALLOWED',
        'Symbolic links are not allowed in the Second Brain.',
      );
    }
  }

  private assertPageBudget(pageId: string, content: string): void {
    const sizeBytes = textEncoder.encode(content).byteLength;
    const maxBytes =
      pageId === SECOND_BRAIN_ENTRY_PAGE
        ? Math.min(this.maxPageBytes, SECOND_BRAIN_ENTRY_MAX_BYTES)
        : this.maxPageBytes;
    if (sizeBytes > maxBytes) {
      throw new SecondBrainError(
        'BUDGET_EXCEEDED',
        'Second Brain page exceeds its configured size limit.',
        { pageId, sizeBytes, maxBytes },
      );
    }
    if (
      pageId === SECOND_BRAIN_ENTRY_PAGE &&
      content.split('\n').length - 1 > SECOND_BRAIN_ENTRY_MAX_LINES
    ) {
      throw new SecondBrainError(
        'BUDGET_EXCEEDED',
        'memory.md exceeds its 200-line navigation-map limit.',
        { pageId, maxLines: SECOND_BRAIN_ENTRY_MAX_LINES },
      );
    }
  }

  private async assertTotalBudget(deltaBytes: number): Promise<void> {
    const totalBytes = await this.calculateManagedPageBytes(this.rootPath, '');
    if (totalBytes + deltaBytes > this.maxTotalBytes) {
      throw new SecondBrainError(
        'BUDGET_EXCEEDED',
        'Second Brain exceeds its configured total size limit.',
        { totalBytes, deltaBytes, maxTotalBytes: this.maxTotalBytes },
      );
    }
  }

  private async calculateManagedPageBytes(
    directory: string,
    relativeDirectory: string,
  ): Promise<number> {
    if (!(await fs.pathExists(directory))) return 0;
    const entries = await fs.readdir(directory, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new SecondBrainError(
          'SYMLINK_NOT_ALLOWED',
          'Symbolic links are not allowed in the Second Brain.',
        );
      }
      if (entry.name === SECOND_BRAIN_META_DIRECTORY) continue;
      const relative = path.posix.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        total += await this.calculateManagedPageBytes(absolute, relative);
      } else if (entry.isFile() && relative.endsWith('.md')) {
        total += (await fs.stat(absolute)).size;
      }
    }
    return total;
  }

  private async walkMarkdownPages(
    directory: string,
    relativeDirectory: string,
  ): Promise<string[]> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const pageIds: string[] = [];
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        throw new SecondBrainError(
          'SYMLINK_NOT_ALLOWED',
          'Symbolic links are not allowed in the Second Brain.',
        );
      }
      if (
        entry.name === SECOND_BRAIN_META_DIRECTORY ||
        entry.name === SECOND_BRAIN_ARCHIVE_DIRECTORY ||
        entry.name.startsWith('.')
      ) {
        continue;
      }
      const relative = path.posix.join(relativeDirectory, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        pageIds.push(...(await this.walkMarkdownPages(absolute, relative)));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        pageIds.push(normalizeSecondBrainPageId(relative));
      }
    }
    return pageIds;
  }

  private static resolveTitle(
    pageId: string,
    frontmatter: SecondBrainFrontmatter,
    body: string,
  ): string {
    if (typeof frontmatter.title === 'string' && frontmatter.title.trim()) {
      return frontmatter.title.trim();
    }
    const heading = body.match(/^#\s+(.+)$/mu)?.[1]?.trim();
    return heading || path.posix.basename(pageId, '.md');
  }

  private async atomicWrite(
    targetPath: string,
    content: string,
  ): Promise<void> {
    await fs.ensureDir(path.dirname(targetPath));
    const temporaryPath = `${targetPath}.${process.pid}.${this.createId()}.tmp`;
    let handle: FileHandle | undefined;
    try {
      handle = await nodeFs.open(temporaryPath, 'wx', 0o600);
      await handle.writeFile(content, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await nodeFs.rename(temporaryPath, targetPath);
    } catch (error) {
      await handle?.close().catch(() => undefined);
      await fs.remove(temporaryPath).catch(() => undefined);
      throw error;
    }
  }

  private revisionsRoot(): string {
    return path.join(this.rootPath, SECOND_BRAIN_META_DIRECTORY, 'revisions');
  }

  private stateBackupsRoot(): string {
    return path.join(
      this.rootPath,
      SECOND_BRAIN_META_DIRECTORY,
      'state-backups',
    );
  }

  private async revisionDirectory(pageId: string): Promise<string> {
    const withoutExtension = pageId.slice(0, -3);
    return this.resolveContainedPath(
      this.revisionsRoot(),
      ...withoutExtension.split('/'),
    );
  }

  private async saveRevision(pageId: string, content: Buffer): Promise<void> {
    const directory = await this.revisionDirectory(pageId);
    await fs.ensureDir(directory);
    const revisionId = `${this.now().getTime()}-${this.createId()}`;
    await this.atomicWrite(
      path.join(directory, `${revisionId}.md`),
      content.toString('utf8'),
    );
    const revisions = await this.listRevisions(pageId);
    await Promise.all(
      revisions
        .slice(this.revisionLimit)
        .map((revision) =>
          fs.remove(path.join(directory, `${revision.revisionId}.md`)),
        ),
    );
  }

  private async readState(
    recoverMalformed: boolean,
  ): Promise<SecondBrainState | null> {
    const statePath = path.join(this.rootPath, SECOND_BRAIN_STATE_FILE);
    if (!(await fs.pathExists(statePath))) return null;
    await this.assertNoSymlink(statePath);
    try {
      const value = await fs.readJson(statePath);
      return SecondBrainService.validateState(value);
    } catch (error) {
      if (!recoverMalformed) throw error;
      await fs.ensureDir(this.stateBackupsRoot());
      const backupPath = path.join(
        this.stateBackupsRoot(),
        `${this.now().getTime()}-${this.createId()}.invalid.json`,
      );
      await nodeFs.rename(statePath, backupPath);
      return null;
    }
  }

  private static validateState(value: unknown): SecondBrainState {
    if (
      !isRecord(value) ||
      value.version !== 1 ||
      typeof value.initializedAt !== 'string' ||
      !isRecord(value.sourceCursors) ||
      !isRecord(value.sourceHashes) ||
      !isRecord(value.pageHashes)
    ) {
      throw new SecondBrainError(
        'INVALID_STATE',
        'Second Brain state file is invalid.',
      );
    }
    return value as SecondBrainState;
  }

  private async writeState(state: SecondBrainState): Promise<void> {
    SecondBrainService.validateState(state);
    await this.atomicWrite(
      path.join(this.rootPath, SECOND_BRAIN_STATE_FILE),
      `${JSON.stringify(state, null, 2)}\n`,
    );
  }

  private async updatePageHash(pageId: string, hash: string): Promise<void> {
    await this.withStateLock(async () => {
      const state = await this.readState(true);
      if (!state) return;
      state.pageHashes[pageId] = hash;
      await this.writeState(state);
    });
  }

  private async removePageHash(pageId: string): Promise<void> {
    await this.withStateLock(async () => {
      const state = await this.readState(true);
      if (!state) return;
      delete state.pageHashes[pageId];
      await this.writeState(state);
    });
  }

  private async requireInitializedState(): Promise<SecondBrainState> {
    await this.ensureSafeRoot();
    const state = await this.readState(true);
    if (!state) {
      throw new SecondBrainError(
        'NOT_INITIALIZED',
        'Second Brain must be initialized before pages can be changed.',
      );
    }
    return state;
  }

  private async withStateLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.stateLock;
    let release: () => void = () => {};
    this.stateLock = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  private async withPageLock<T>(
    pageId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = this.pageLocks.get(pageId) ?? Promise.resolve();
    let release: () => void = () => {};
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(() => blocker);
    this.pageLocks.set(pageId, queued);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.pageLocks.get(pageId) === queued) this.pageLocks.delete(pageId);
    }
  }
}
