/**
 * Static Site Service
 *
 * Orchestrates the export of DBT Studio Analytics pages into a self-contained
 * static website folder. Follows the main-process service pattern: all business
 * logic here, IPC handlers are thin wrappers (see staticSite.ipcHandlers.ts).
 */

import { BrowserWindow, shell, dialog, app } from 'electron';
import fs from 'fs';
import path from 'path';
import { AnalyticsPagesService } from './analyticsPages.service';
import ConnectorsService from './connectors.service';
import MainDatabaseService from './mainDatabase.service';
import SettingsService from './settings.service';
import { extractQueryReferences } from '../../renderer/components/analytics/runtime/queryDependencyResolver';
import DuckLakeService from './duckLake.service';
import {
  toSlug,
  generateSiteShell,
  generateSiteCSS,
  generatePageHtml,
  type StaticPageMeta,
  type StaticPageData,
} from './staticSiteTemplates';
import type {
  StaticSiteBuildOptions,
  StaticSiteBuildResult,
  StaticSiteBuildProgress,
  StaticSiteState,
  StaticSiteDeleteResult,
} from '../../types/staticSite';

// Attempt to load the pre-compiled runtime bundle path
const RUNTIME_BUNDLE_PATH = path.join(
  app.getAppPath(),
  'resources',
  'analytics-runtime.umd.js',
);

// Production / packaged app — extraResources copies to process.resourcesPath
const RUNTIME_BUNDLE_PROD_PATH = path.join(
  process.resourcesPath,
  'resources',
  'analytics-runtime.umd.js',
);

// Fallback for development — look in the project root
const RUNTIME_BUNDLE_DEV_PATH = path.resolve(
  __dirname,
  '../../../../resources/analytics-runtime.umd.js',
);

const MAX_ROWS_PER_QUERY = 10_000;

// ─── Public types ─────────────────────────────────────────────────────────────

export type {
  StaticSiteBuildOptions,
  StaticSiteBuildResult,
  StaticSiteBuildProgress,
  StaticSiteState,
  StaticSiteDeleteResult,
};

// ─── Helper: selective build wipe (preserves .git and user files) ─────────────

/**
 * Delete only the files/folders the build process controls.
 * Preserves .git/, CNAME, README.md, and any other user files.
 */
function wipePreviousBuild(outputPath: string): void {
  const controlled = ['index.html', 'assets', 'pages'];
  controlled.forEach((name) => {
    const target = path.join(outputPath, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
    }
  });
}

// ─── Helper: parse SQL blocks from markdown (main-process safe) ──────────────

interface SqlBlock {
  name: string;
  sql: string;
}

function extractSqlBlocks(markdown: string): SqlBlock[] {
  const blocks: SqlBlock[] = [];
  // Match ```sql <name>\n...\n``` blocks
  const regex = /```sql\s+(\w+)\s*\n([\s\S]*?)```/g;
  let match = regex.exec(markdown);
  while (match !== null) {
    const name = match[1].trim();
    const sql = match[2].trim();
    if (name && sql) {
      blocks.push({ name, sql });
    }
    match = regex.exec(markdown);
  }
  return blocks;
}

/** Resolve {{query_name}} references and return blocks in dependency order */
function resolveDependencyOrder(blocks: SqlBlock[]): SqlBlock[] {
  const byName = new Map(blocks.map((b) => [b.name, b]));
  const visited = new Set<string>();
  const order: SqlBlock[] = [];

  function visit(name: string, chain: Set<string>) {
    if (visited.has(name)) return;
    if (chain.has(name)) return; // circular — skip
    chain.add(name);
    const block = byName.get(name);
    if (!block) return;
    const deps = extractQueryReferences(block.sql);
    deps.forEach((dep) => {
      visit(dep, new Set(chain));
    });
    visited.add(name);
    order.push(block);
  }

  blocks.forEach((block) => {
    visit(block.name, new Set());
  });
  return order;
}

/** Convert a JS value to a SQL literal that is safe for inline VALUES clauses. */
function toSqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'number' || typeof v === 'bigint') return String(v);
  // Strings: single-quote with escaped single quotes ('' per ANSI SQL)
  return `'${String(v).replace(/'/g, "''")}'`;
}

/** Substitute {{query_name}} references with a CTE or subquery using already-run results */
function substituteQueryRefs(
  sql: string,
  results: Record<string, any[]>,
): string {
  // Use extractQueryReferences to find dependencies to replace
  const deps = extractQueryReferences(sql);
  let resolvedSql = sql;
  deps.forEach((name) => {
    const rows = results[name];
    let substitution = '(SELECT NULL WHERE FALSE)';
    if (rows && rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const values = rows
        .slice(0, 500) // limit substituted rows
        .map(
          (row) =>
            `(${cols.map((c) => toSqlLiteral(row[c] ?? null)).join(', ')})`,
        )
        .join(', ');
      // Column names as double-quoted identifiers (ANSI SQL) — this is correct
      substitution = `(SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM (VALUES ${values}) AS _t(${cols.map((c) => `"${c}"`).join(', ')}))`;
    }
    // Allow optional whitespace around the name to match both {{name}} and {{ name }}
    const regex = new RegExp(`\\{\\{\\s*${name}\\s*\\}\\}`, 'g');
    resolvedSql = resolvedSql.replace(regex, substitution);
  });
  return resolvedSql;
}

// ─── Query execution (main-process) ──────────────────────────────────────────

async function executeQueryInMain(params: {
  connectionId: string;
  queryName: string;
  sql: string;
}): Promise<{ data: any[]; error: string | null; truncated: boolean }> {
  const { connectionId, sql } = params;

  try {
    if (connectionId.startsWith('ducklake-')) {
      const instanceId = connectionId.replace('ducklake-', '');
      const response = await DuckLakeService.executeQuery({
        instanceId,
        query: sql,
        limit: MAX_ROWS_PER_QUERY + 1,
        offset: 0,
      });

      if (!response.success) {
        return {
          data: [],
          error: response.error ?? 'Query failed',
          truncated: false,
        };
      }
      const raw = response.data ?? [];
      const truncated = raw.length > MAX_ROWS_PER_QUERY;
      return { data: raw.slice(0, MAX_ROWS_PER_QUERY), error: null, truncated };
    }

    // Regular DB connection
    const response = await ConnectorsService.executeQueryForConnection({
      connectionId,
      query: sql,
    });

    if (!response.success) {
      return {
        data: [],
        error: response.error ?? 'Query failed',
        truncated: false,
      };
    }
    const raw = response.data ?? [];
    const truncated = raw.length > MAX_ROWS_PER_QUERY;
    return { data: raw.slice(0, MAX_ROWS_PER_QUERY), error: null, truncated };
  } catch (err: any) {
    return {
      data: [],
      error: err?.message ?? 'Unknown error',
      truncated: false,
    };
  }
}

// ─── Runtime bundle resolution ────────────────────────────────────────────────

function getRuntimeBundlePath(): string | null {
  if (fs.existsSync(RUNTIME_BUNDLE_PROD_PATH)) return RUNTIME_BUNDLE_PROD_PATH;
  if (fs.existsSync(RUNTIME_BUNDLE_PATH)) return RUNTIME_BUNDLE_PATH;
  if (fs.existsSync(RUNTIME_BUNDLE_DEV_PATH)) return RUNTIME_BUNDLE_DEV_PATH;
  return null;
}

// ─── Progress helper ──────────────────────────────────────────────────────────

function sendProgress(
  mainWindow: BrowserWindow,
  progress: StaticSiteBuildProgress,
) {
  mainWindow.webContents.send('analytics:static-site:build-progress', progress);
}

// ─── Connection name helper ───────────────────────────────────────────────────

async function getConnectionName(connectionId: string): Promise<string> {
  try {
    if (connectionId.startsWith('ducklake-')) {
      return 'DuckLake';
    }
    const conn = await ConnectorsService.getConnectionById(connectionId);
    return conn?.connection?.name ?? connectionId;
  } catch {
    return connectionId;
  }
}

// ─── Public service ───────────────────────────────────────────────────────────

export class StaticSiteService {
  /** Build the static analytics site for a connection */
  static async build(
    mainWindow: BrowserWindow,
    opts: StaticSiteBuildOptions,
  ): Promise<StaticSiteBuildResult> {
    const { connectionId, outputPath, overwrite } = opts;

    try {
      // 1. Check for existing output folder
      if (fs.existsSync(outputPath)) {
        if (!overwrite) {
          return {
            success: false,
            outputPath,
            pageCount: 0,
            queryCount: 0,
            error: 'OUTPUT_EXISTS',
          };
        }
        sendProgress(mainWindow, {
          phase: 'writing',
          message:
            'Removing previous build files (preserving .git and user files)…',
        });
        wipePreviousBuild(outputPath);
      }

      // 2. Load pages
      sendProgress(mainWindow, {
        phase: 'loading',
        message: 'Loading analytics pages…',
      });
      const pages = await AnalyticsPagesService.list(connectionId);
      if (pages.length === 0) {
        return {
          success: false,
          outputPath,
          pageCount: 0,
          queryCount: 0,
          error: 'No analytics pages found for this connection.',
        };
      }

      sendProgress(mainWindow, {
        phase: 'loading',
        message: `Loaded ${pages.length} page${pages.length !== 1 ? 's' : ''}`,
        current: pages.length,
        total: pages.length,
      });

      const connectionName = await getConnectionName(connectionId);
      // Detect theme from app-level settings — default to light
      const themeMode: 'light' | 'dark' = 'light';

      // Build page metadata (slug must be unique)
      const slugCounts = new Map<string, number>();
      const pageMetas: StaticPageMeta[] = pages.map((p) => {
        let slug = toSlug(p.title || p.routePath.replace(/^\//, '') || 'page');
        const count = slugCounts.get(slug) ?? 0;
        slugCounts.set(slug, count + 1);
        if (count > 0) slug = `${slug}-${count}`;
        return { id: p.id, title: p.title, slug, routePath: p.routePath };
      });

      // 3. Execute queries per page
      const pageDataMap = new Map<string, StaticPageData>();
      let totalQueryCount = 0;

      // Pages are processed sequentially so progress messages arrive in order
      // and so query results from page N are isolated from page N+1.
      for (let pi = 0; pi < pages.length; pi += 1) {
        const page = pages[pi];
        const meta = pageMetas[pi];

        sendProgress(mainWindow, {
          phase: 'querying',
          message: `Executing queries for "${meta.title}"…`,
          current: pi + 1,
          total: pages.length,
        });

        const sqlBlocks = extractSqlBlocks(page.markdownContent ?? '');
        const orderedBlocks = resolveDependencyOrder(sqlBlocks);
        totalQueryCount += orderedBlocks.length;

        const queryResults: Record<string, any[]> = {};
        const queryStatuses: Record<string, 'success' | 'error'> = {};
        const queryErrors: Record<string, string | null> = {};
        const truncated: Record<string, boolean> = {};

        // Queries must run sequentially: later queries may reference earlier results
        // via {{query_name}} substitution, so parallelism is not possible here.
        for (let qi = 0; qi < orderedBlocks.length; qi += 1) {
          const block = orderedBlocks[qi];
          const resolvedSql = substituteQueryRefs(block.sql, queryResults);

          sendProgress(mainWindow, {
            phase: 'querying',
            message: `[${meta.title}] Running "${block.name}" (${qi + 1}/${orderedBlocks.length})…`,
            current: pi + 1,
            total: pages.length,
          });

          // eslint-disable-next-line no-await-in-loop
          const result = await executeQueryInMain({
            connectionId,
            queryName: block.name,
            sql: resolvedSql,
          });

          queryResults[block.name] = result.data;
          queryStatuses[block.name] = result.error ? 'error' : 'success';
          queryErrors[block.name] = result.error;
          truncated[block.name] = result.truncated;
        }

        pageDataMap.set(meta.id, {
          pageTitle: meta.title,
          markdown: page.markdownContent ?? '',
          queryResults,
          queryStatuses,
          queryErrors,
          themeMode,
          builtAt: new Date().toISOString(),
          truncated,
        });
      }

      // 4. Create output directory structure
      sendProgress(mainWindow, {
        phase: 'rendering',
        message: 'Generating HTML files…',
      });
      fs.mkdirSync(path.join(outputPath, 'pages'), { recursive: true });
      fs.mkdirSync(path.join(outputPath, 'assets'), { recursive: true });

      // 5. Write index.html shell
      const indexHtml = generateSiteShell(pageMetas, connectionName, themeMode);
      fs.writeFileSync(path.join(outputPath, 'index.html'), indexHtml, 'utf-8');

      // 6. Write site.css
      fs.writeFileSync(
        path.join(outputPath, 'assets', 'site.css'),
        generateSiteCSS(),
        'utf-8',
      );

      // 7. Copy runtime bundle
      const runtimeSrc = getRuntimeBundlePath();
      const runtimeDest = path.join(
        outputPath,
        'assets',
        'analytics-runtime.umd.js',
      );
      if (runtimeSrc) {
        fs.copyFileSync(runtimeSrc, runtimeDest);
      } else {
        // Write a stub that shows a friendly error
        fs.writeFileSync(
          runtimeDest,
          `/* analytics-runtime.umd.js not found — rebuild DBT Studio to generate it */\nwindow.AnalyticsRuntime = { mount: function(el) { el.innerHTML = '<div style="padding:32px;color:#d32f2f"><h2>Runtime bundle missing</h2><p>Please rebuild the site from DBT Studio.</p></div>'; } };`,
          'utf-8',
        );
      }

      // 8. Write per-page HTML files
      sendProgress(mainWindow, {
        phase: 'writing',
        message: `Writing ${pageMetas.length} pages…`,
        current: 0,
        total: pageMetas.length,
      });

      for (let pi = 0; pi < pageMetas.length; pi += 1) {
        const meta = pageMetas[pi];
        const pageData = pageDataMap.get(meta.id);
        if (pageData) {
          sendProgress(mainWindow, {
            phase: 'writing',
            message: `Writing "${meta.title}"…`,
            current: pi + 1,
            total: pageMetas.length,
          });

          const html = generatePageHtml(meta, pageData);
          fs.writeFileSync(
            path.join(outputPath, 'pages', `${meta.slug}.html`),
            html,
            'utf-8',
          );
        }
      }

      // 9. Persist build state
      await MainDatabaseService.upsertStaticSiteState({
        connectionId,
        lastBuildPath: outputPath,
        lastBuildAt: new Date().toISOString(),
        lastBuildPageCount: pageMetas.length,
        lastBuildQueryCount: totalQueryCount,
      });

      sendProgress(mainWindow, {
        phase: 'done',
        message: `Built ${pageMetas.length} pages with ${totalQueryCount} queries.`,
        current: pageMetas.length,
        total: pageMetas.length,
      });

      return {
        success: true,
        outputPath,
        pageCount: pageMetas.length,
        queryCount: totalQueryCount,
      };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[StaticSiteService] Build failed:', err);
      sendProgress(mainWindow, {
        phase: 'error',
        message: err?.message ?? 'Build failed',
      });
      return {
        success: false,
        outputPath,
        pageCount: 0,
        queryCount: 0,
        error: err?.message ?? 'Build failed',
      };
    }
  }

  /** Open the output folder in Finder / Explorer */
  static async openFolder(folderPath: string): Promise<void> {
    await shell.openPath(folderPath);
  }

  /** Open the index.html in the default browser */
  static async openPreview(folderPath: string): Promise<void> {
    const indexPath = path.join(folderPath, 'index.html');
    await shell.openExternal(`file://${indexPath}`);
  }

  /** Show a native folder picker and return the chosen path (or null) */
  static async pickFolder(defaultPath: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      defaultPath,
      properties: ['openDirectory', 'createDirectory'],
      title: 'Choose output folder for Analytics site',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  }

  /** Get the persisted last-build state for a connection */
  static async getState(connectionId: string): Promise<StaticSiteState | null> {
    return MainDatabaseService.getStaticSiteState(connectionId);
  }

  /** Check whether the last-built folder still exists on disk */
  static folderExists(folderPath: string): boolean {
    return fs.existsSync(folderPath);
  }

  /** Get the default output path for a connection */
  static async getDefaultOutputPath(connectionName: string): Promise<string> {
    const settings = await SettingsService.loadSettings();
    const projectsDirectory =
      settings.projectsDirectory ||
      path.join(app.getPath('home'), 'rosetta-dbt-studio-projects');
    const safe =
      connectionName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') || 'analytics-site';
    return path.join(projectsDirectory, 'analytics-pages-and-BI', safe);
  }

  /** Delete the build folder entirely (full wipe incl. .git) and clear DB state */
  static async deleteBuild(
    connectionId: string,
    folderPath: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const state = await this.getState(connectionId);
      if (!state || state.lastBuildPath !== folderPath) {
        return { success: false, error: 'Invalid or unauthorized build path' };
      }

      // Additional safety check to prevent wiping root directories or out-of-scope paths
      if (folderPath.length < 10) {
        return {
          success: false,
          error: 'Path too short, aborting deletion for safety',
        };
      }

      if (fs.existsSync(folderPath)) {
        const stats = fs.lstatSync(folderPath);
        if (stats.isSymbolicLink()) {
          return { success: false, error: 'Target is a symbolic link' };
        }
        fs.rmSync(folderPath, { recursive: true, force: true });
      }
      await MainDatabaseService.deleteStaticSiteState(connectionId);
      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // eslint-disable-next-line no-console
      console.error('[StaticSiteService] deleteBuild error:', msg);
      return { success: false, error: msg };
    }
  }
}
