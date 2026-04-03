// Filesystem Tools for AI SDK v6 ToolLoopAgent
// General-purpose file operations with security constraints

import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

const MAX_FILE_SIZE = 1_000_000; // 1 MB for general files
const MAX_DIRECTORY_DEPTH = 5;

/**
 * Validates that a file path is within the project root
 */
function assertWithinProject(filePath: string, projectPath: string): void {
  const resolved = path.resolve(filePath);
  const projectRoot = path.resolve(projectPath);
  if (!resolved.startsWith(projectRoot)) {
    throw new Error(
      `Access denied: path must be within project root. Attempted: ${resolved}, Root: ${projectRoot}`,
    );
  }
}

/**
 * List files and directories in a given path
 */
export const listDirectory = tool({
  description:
    'List files and directories in a given path. Useful for exploring project structure.',
  inputSchema: z.object({
    dirPath: z.string().describe('Absolute path to the directory to list'),
    projectPath: z
      .string()
      .describe('Absolute path to the project root directory'),
    recursive: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to list recursively (default: false)'),
  }),
  execute: async ({ dirPath, projectPath, recursive }) => {
    try {
      assertWithinProject(dirPath, projectPath);

      if (!fs.existsSync(dirPath)) {
        return { error: `Directory not found: ${dirPath}`, entries: [] };
      }

      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        return { error: `Not a directory: ${dirPath}`, entries: [] };
      }

      const listRecursive = (
        dir: string,
        depth: number = 0,
      ): Array<{ path: string; type: 'file' | 'directory'; size?: number }> => {
        if (depth > MAX_DIRECTORY_DEPTH) {
          return [];
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });

        return entries.flatMap((entry) => {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(projectPath, fullPath);

          if (entry.isDirectory()) {
            const dirEntry = { path: relativePath, type: 'directory' as const };
            if (recursive) {
              return [dirEntry, ...listRecursive(fullPath, depth + 1)];
            }
            return [dirEntry];
          }
          if (entry.isFile()) {
            const fileStat = fs.statSync(fullPath);
            return [
              {
                path: relativePath,
                type: 'file' as const,
                size: fileStat.size,
              },
            ];
          }
          return [];
        });
      };

      const entries = listRecursive(dirPath);

      return {
        success: true,
        directory: path.relative(projectPath, dirPath),
        count: entries.length,
        entries,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error listing directory',
        entries: [],
      };
    }
  },
});

/**
 * Read a text file
 */
export const readFile = tool({
  description:
    'Read the contents of a text file. Use this for reading any project file.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the file to read'),
    projectPath: z
      .string()
      .describe('Absolute path to the project root directory'),
  }),
  execute: async ({ filePath, projectPath }) => {
    try {
      assertWithinProject(filePath, projectPath);

      if (!fs.existsSync(filePath)) {
        return { error: `File not found: ${filePath}` };
      }

      const stat = fs.statSync(filePath);
      if (stat.size > MAX_FILE_SIZE) {
        return {
          error: `File too large to read (${stat.size} bytes). Maximum: ${MAX_FILE_SIZE} bytes`,
        };
      }

      const content = fs.readFileSync(filePath, 'utf-8');
      return {
        success: true,
        filePath: path.relative(projectPath, filePath),
        content,
        size: stat.size,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Unknown error reading file',
      };
    }
  },
});

/**
 * Write a text file
 */
export const writeFile = tool({
  description:
    'Write content to a text file. Creates the file if it does not exist, overwrites if it does.',
  inputSchema: z.object({
    filePath: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    projectPath: z
      .string()
      .describe('Absolute path to the project root directory'),
  }),
  execute: async ({ filePath, content, projectPath }) => {
    try {
      assertWithinProject(filePath, projectPath);

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        filePath: path.relative(projectPath, filePath),
        bytesWritten: Buffer.byteLength(content, 'utf-8'),
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Unknown error writing file',
      };
    }
  },
});

/**
 * Check if a file or directory exists
 */
export const pathExists = tool({
  description:
    'Check if a file or directory exists at the given path. Returns type (file/directory) if it exists.',
  inputSchema: z.object({
    targetPath: z.string().describe('Absolute path to check'),
    projectPath: z
      .string()
      .describe('Absolute path to the project root directory'),
  }),
  execute: async ({ targetPath, projectPath }) => {
    try {
      assertWithinProject(targetPath, projectPath);

      if (!fs.existsSync(targetPath)) {
        return {
          exists: false,
          path: path.relative(projectPath, targetPath),
        };
      }

      const stat = fs.statSync(targetPath);
      return {
        exists: true,
        path: path.relative(projectPath, targetPath),
        type: stat.isDirectory() ? 'directory' : 'file',
        size: stat.isFile() ? stat.size : undefined,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error checking path',
        exists: false,
      };
    }
  },
});

/**
 * Export all filesystem tools as a single object
 */
export const filesystemTools = {
  listDirectory,
  readFile,
  writeFile,
  pathExists,
};
