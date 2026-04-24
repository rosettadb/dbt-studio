/* eslint-disable no-console */
/**
 * SessionContextService — builds a compact, one-time context block injected
 * into the agent system prompt at the start of each conversation.
 *
 * Phase A context (injected once, stays constant for the session):
 *   - dbt project summary: model names, sources, macros from manifest.json
 *   - Currently open file in the editor (full content if small, truncated if large)
 *   - Top-level project directory listing
 *
 * Token budget: ~3,000 tokens max so it doesn't crowd out conversation history.
 */

import path from 'path';
import fs from 'fs-extra';
import { estimateTokens, truncateToolResult } from './tokenEstimator';

const MANIFEST_FILE = path.join('target', 'manifest.json');
const SESSION_CONTEXT_TOKEN_BUDGET = 3_000;
const SELECTED_FILE_TOKEN_BUDGET = 1_500;

export interface SessionContext {
  /** Compact summary of the dbt project (models, sources, macros) */
  projectSummary: string;
  /** Content of the currently open file in the editor, if any */
  selectedFile?: { path: string; content: string };
  /** Top-level directory listing of the project */
  projectStructure: string;
  /** Estimated token count for the full session context block */
  tokenCount: number;
}

export class SessionContextService {
  /**
   * Builds the session context for a given project path.
   * @param projectPath  Absolute path to the dbt project root
   * @param selectedFilePath  Optional: path to the file currently open in the editor
   */
  static async build(
    projectPath: string,
    selectedFilePath?: string,
  ): Promise<SessionContext> {
    const [projectSummary, selectedFile, projectStructure] = await Promise.all([
      this.buildProjectSummary(projectPath),
      selectedFilePath
        ? this.readSelectedFile(selectedFilePath, projectPath)
        : Promise.resolve(undefined),
      this.buildProjectStructure(projectPath),
    ]);

    const tokenCount = estimateTokens(
      [projectSummary, selectedFile?.content ?? '', projectStructure].join(
        '\n',
      ),
    );

    return { projectSummary, selectedFile, projectStructure, tokenCount };
  }

  /**
   * Formats the session context as a string suitable for injection into the
   * agent system prompt.
   */
  static format(ctx: SessionContext): string {
    const parts: string[] = [];

    if (ctx.projectSummary) {
      parts.push(`## dbt Project Overview\n\n${ctx.projectSummary}`);
    }

    if (ctx.projectStructure) {
      parts.push(`## Project Structure\n\n${ctx.projectStructure}`);
    }

    if (ctx.selectedFile) {
      parts.push(
        `## Currently Open File: ${ctx.selectedFile.path}\n\n\`\`\`\n${ctx.selectedFile.content}\n\`\`\``,
      );
    }

    return parts.join('\n\n');
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private static async buildProjectSummary(
    projectPath: string,
  ): Promise<string> {
    try {
      const manifestPath = path.join(projectPath, MANIFEST_FILE);
      if (!(await fs.pathExists(manifestPath))) {
        return '(manifest.json not found — run `dbt compile` or `dbt run` to generate it)';
      }

      const raw = await fs.readJson(manifestPath);
      const nodes: Record<string, any> = raw.nodes ?? {};
      const sources: Record<string, any> = raw.sources ?? {};
      const macros: Record<string, any> = raw.macros ?? {};

      const models: string[] = [];
      const sourceNames: string[] = [];
      const macroNames: string[] = [];

      Object.entries(nodes).forEach(([uid, node]) => {
        const rt = node.resource_type ?? uid.split('.')[0];
        if (rt === 'model' && node.name) models.push(node.name);
      });

      Object.values(sources).forEach((src: any) => {
        if (src.source_name && src.name) {
          sourceNames.push(`${src.source_name}.${src.name}`);
        }
      });

      Object.values(macros).forEach((macro: any) => {
        if (macro.name) macroNames.push(macro.name);
      });

      const lines: string[] = [];

      if (models.length > 0) {
        // Cap at 50 model names to stay within token budget
        const shown = models.slice(0, 50);
        const extra = models.length - shown.length;
        lines.push(
          `**Models (${models.length}):** ${shown.join(', ')}${extra > 0 ? ` … and ${extra} more` : ''}`,
        );
      }

      if (sourceNames.length > 0) {
        const shown = sourceNames.slice(0, 30);
        const extra = sourceNames.length - shown.length;
        lines.push(
          `**Sources (${sourceNames.length}):** ${shown.join(', ')}${extra > 0 ? ` … and ${extra} more` : ''}`,
        );
      }

      if (macroNames.length > 0) {
        const shown = macroNames.slice(0, 20);
        const extra = macroNames.length - shown.length;
        lines.push(
          `**Macros (${macroNames.length}):** ${shown.join(', ')}${extra > 0 ? ` … and ${extra} more` : ''}`,
        );
      }

      return lines.length > 0
        ? lines.join('\n')
        : '(No models, sources, or macros found in manifest)';
    } catch (error) {
      console.error(
        '[SessionContextService] Failed to build project summary:',
        error,
      );
      return '(Could not read manifest.json)';
    }
  }

  private static async readSelectedFile(
    filePath: string,
    projectPath: string,
  ): Promise<{ path: string; content: string } | undefined> {
    try {
      if (!(await fs.pathExists(filePath))) return undefined;
      const raw = await fs.readFile(filePath, 'utf-8');
      const relativePath = path.relative(projectPath, filePath);
      // Truncate large files to stay within the per-file token budget
      const content = truncateToolResult(raw, SELECTED_FILE_TOKEN_BUDGET);
      return { path: relativePath, content };
    } catch (error) {
      console.error(
        '[SessionContextService] Failed to read selected file:',
        error,
      );
      return undefined;
    }
  }

  private static async buildProjectStructure(
    projectPath: string,
  ): Promise<string> {
    try {
      const entries = await fs.readdir(projectPath, { withFileTypes: true });
      const lines = entries
        .filter((e) => !e.name.startsWith('.') && e.name !== 'node_modules')
        .map((e) => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`)
        .slice(0, 30); // Cap at 30 entries
      return lines.join('\n');
    } catch (error) {
      console.error(
        '[SessionContextService] Failed to list project structure:',
        error,
      );
      return '';
    }
  }
}

/**
 * Builds and formats a session context block ready for injection into the
 * agent system prompt. Returns an empty string if projectPath is not provided.
 */
export async function buildSessionContextBlock(
  projectPath: string | undefined,
  selectedFilePath?: string,
): Promise<string> {
  if (!projectPath) return '';
  try {
    const ctx = await SessionContextService.build(
      projectPath,
      selectedFilePath,
    );
    // Only inject if it fits within the budget
    if (ctx.tokenCount > SESSION_CONTEXT_TOKEN_BUDGET) {
      // Build without the selected file to save tokens
      const ctxNoFile = await SessionContextService.build(projectPath);
      return SessionContextService.format(ctxNoFile);
    }
    return SessionContextService.format(ctx);
  } catch (error) {
    console.error(
      '[SessionContextService] buildSessionContextBlock failed:',
      error,
    );
    return '';
  }
}
