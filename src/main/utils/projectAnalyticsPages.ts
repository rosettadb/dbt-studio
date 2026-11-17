/**
 * Analytics pages saved as Markdown files in `<project>/analytics/` (plan
 * 95d). The file holds exactly the page's markdown (frontmatter included);
 * the route comes from the file path and the title from the frontmatter.
 *
 * Every path stays inside the project's analytics folder: symlinks and
 * hidden folders are skipped, and ids resolve only to files under it.
 */
import { shell } from 'electron';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import path from 'path';
import {
  PROJECT_ANALYTICS_DIR,
  pagePathFromRoute,
  parseProjectPageId,
  projectPageId,
  routeFromPagePath,
} from '../../shared/projectFolders';
import type { AnalyticsPage } from '../../types/analyticsPages';

export const projectAnalyticsRoot = (projectPath: string): string =>
  path.join(projectPath, PROJECT_ANALYTICS_DIR);

/** The frontmatter `title`, or the file name when there is none. */
export function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown);
  if (match) {
    try {
      const front = yaml.load(match[1]) as { title?: unknown } | undefined;
      if (typeof front?.title === 'string' && front.title.trim()) {
        return front.title.trim();
      }
    } catch {
      // Malformed frontmatter: fall back to the file name
    }
  }
  return fallback;
}

/** Absolute path of a page file, refusing anything outside analytics/. */
function pageFile(projectPath: string, relativePath: string): string {
  const root = path.resolve(projectAnalyticsRoot(projectPath));
  const filePath = path.resolve(root, relativePath);
  if (!filePath.startsWith(`${root}${path.sep}`) || !filePath.endsWith('.md')) {
    throw new Error('Page path is outside the project analytics folder');
  }
  return filePath;
}

async function walk(folder: string, found: string[]): Promise<void> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  // eslint-disable-next-line no-restricted-syntax
  for (const entry of entries) {
    if (entry.isSymbolicLink() || entry.name.startsWith('.')) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) {
      // eslint-disable-next-line no-await-in-loop
      await walk(full, found);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      found.push(full);
    }
  }
}

async function readPage(
  projectId: string,
  projectPath: string,
  connectionId: string,
  relativePath: string,
): Promise<AnalyticsPage> {
  const filePath = pageFile(projectPath, relativePath);
  const [markdown, stat] = await Promise.all([
    fs.readFile(filePath, 'utf-8'),
    fs.stat(filePath),
  ]);
  return {
    id: projectPageId(projectId, relativePath),
    connectionId,
    title: titleFromMarkdown(
      markdown,
      path.basename(relativePath, path.extname(relativePath)),
    ),
    routePath: routeFromPagePath(relativePath),
    markdownContent: markdown,
    createdAt: stat.birthtime.toISOString(),
    updatedAt: stat.mtime.toISOString(),
  };
}

export async function listProjectPages(
  projectId: string,
  projectPath: string,
  connectionId: string,
): Promise<AnalyticsPage[]> {
  const root = projectAnalyticsRoot(projectPath);
  if (!(await fs.pathExists(root))) return [];
  const files: string[] = [];
  await walk(root, files);
  const pages = await Promise.all(
    files.map((file) =>
      readPage(
        projectId,
        projectPath,
        connectionId,
        path.relative(root, file).split(path.sep).join('/'),
      ).catch(() => null),
    ),
  );
  return pages.filter((page): page is AnalyticsPage => page !== null);
}

export async function getProjectPage(
  pageId: string,
  projectPath: string,
  connectionId: string,
): Promise<AnalyticsPage> {
  const parsed = parseProjectPageId(pageId);
  if (!parsed) throw new Error(`Invalid page id: "${pageId}"`);
  return readPage(
    parsed.projectId,
    projectPath,
    connectionId,
    parsed.relativePath,
  );
}

/** Write a new page at its route's path; a taken path gets `-2`, `-3`... */
export async function createProjectPage(
  projectId: string,
  projectPath: string,
  connectionId: string,
  routePath: string,
  markdown: string,
): Promise<AnalyticsPage> {
  const wanted = pagePathFromRoute(routePath);
  let relativePath = wanted;
  let suffix = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await fs.pathExists(pageFile(projectPath, relativePath))) {
    relativePath = wanted.replace(/\.md$/, `-${suffix}.md`);
    suffix += 1;
  }
  const filePath = pageFile(projectPath, relativePath);
  await fs.mkdirp(path.dirname(filePath));
  await fs.writeFile(filePath, markdown, 'utf-8');
  return readPage(projectId, projectPath, connectionId, relativePath);
}

/** Save the page's markdown. Its route is its file path and doesn't change here. */
export async function updateProjectPage(
  pageId: string,
  projectPath: string,
  connectionId: string,
  markdown: string | undefined,
): Promise<AnalyticsPage> {
  const parsed = parseProjectPageId(pageId);
  if (!parsed) throw new Error(`Invalid page id: "${pageId}"`);
  if (markdown !== undefined) {
    await fs.writeFile(
      pageFile(projectPath, parsed.relativePath),
      markdown,
      'utf-8',
    );
  }
  return readPage(
    parsed.projectId,
    projectPath,
    connectionId,
    parsed.relativePath,
  );
}

/** The file may be in Git: move it to the OS trash so it can be restored. */
export async function deleteProjectPage(
  pageId: string,
  projectPath: string,
): Promise<void> {
  const parsed = parseProjectPageId(pageId);
  if (!parsed) throw new Error(`Invalid page id: "${pageId}"`);
  await shell.trashItem(pageFile(projectPath, parsed.relativePath));
}
