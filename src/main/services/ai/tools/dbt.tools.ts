// dbt Tools for AI SDK v6 ToolLoopAgent
// These tools provide AI agents with safe, controlled access to dbt project operations

import { tool } from 'ai';
import { z } from 'zod';
import { spawn, execFileSync } from 'child_process';
import type { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import SettingsService from '../../settings.service';
import { DbtCoreVersionService } from '../../dbtCoreVersion.service';
import AgentService from '../../agent.service';
import { TerminalConfirmGate } from './terminalConfirmGate';

// Security constraints
const ALLOWED_DBT_COMMANDS = [
  'run',
  'test',
  'compile',
  'docs',
  'debug',
  'deps',
  'source',
  'snapshot',
  'seed',
  'clean',
];
const MAX_FILE_SIZE = 500_000; // 500 KB
const COMMAND_TIMEOUT = 120_000; // 2 minutes

function parseExtraArgs(extraArgs?: string): string[] {
  if (!extraArgs) return [];
  const parsed = extraArgs.match(/(?:[^\s"']+|(["'])[^\1]*?\1)+/g);
  if (!parsed) return [];
  return parsed.map((p) => {
    if (
      (p.startsWith('"') && p.endsWith('"')) ||
      (p.startsWith("'") && p.endsWith("'"))
    ) {
      return p.slice(1, -1);
    }
    return p;
  });
}

function normalizeCommand(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function isAllowedCommand(command: string, allowedCommands: string[]): boolean {
  const normalized = normalizeCommand(command).toLowerCase();
  return allowedCommands.some((allowed) => {
    const normalizedAllowed = normalizeCommand(allowed).toLowerCase();
    return (
      normalized === normalizedAllowed ||
      normalized.startsWith(`${normalizedAllowed} `)
    );
  });
}

export async function executeDbtCommand(opts: {
  command: string;
  select?: string;
  extraArgs?: string;
  projectPath: string;
  conversationId?: number;
  mainWindow?: BrowserWindow;
  toolName: string;
  requireApproval?: boolean;
  strictApproval?: boolean;
  allowedCommands?: string[];
}): Promise<any> {
  const {
    command,
    select,
    extraArgs,
    projectPath,
    conversationId,
    mainWindow,
    toolName,
    requireApproval = true,
    strictApproval = false,
    allowedCommands,
  } = opts;

  const normalizedCommand = normalizeCommand(command);

  if (allowedCommands && allowedCommands.length > 0) {
    if (!isAllowedCommand(normalizedCommand, allowedCommands)) {
      return {
        ok: false,
        error: `Command not permitted: ${normalizedCommand}. Allowed commands: ${allowedCommands.join(', ')}`,
      };
    }
  } else {
    const baseCommand = normalizedCommand.split(' ')[0];
    if (!ALLOWED_DBT_COMMANDS.includes(baseCommand)) {
      return {
        ok: false,
        error: `Command not permitted: ${baseCommand}. Allowed commands: ${ALLOWED_DBT_COMMANDS.join(', ')}`,
      };
    }
  }

  try {
    const adapterCheck =
      await DbtCoreVersionService.checkProjectAdapterCompatibility(projectPath);
    if (!adapterCheck.adapter.canExecute) {
      return {
        ok: false,
        error: `dbt command blocked: ${adapterCheck.adapter.notes}`,
        adapter: adapterCheck.adapter,
      };
    }

    const dbtExe = await SettingsService.getDbtExePath();
    const args = normalizedCommand.split(' ').filter(Boolean);
    if (select) args.push('--select', select);
    args.push(...parseExtraArgs(extraArgs));

    const displayCmd = `"${dbtExe}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

    const context = conversationId
      ? AgentService.getAgentContext(conversationId)
      : AgentService.currentAgentContext;

    if (requireApproval) {
      if (strictApproval && !context) {
        return {
          ok: false,
          error:
            'Agent context unavailable; cannot request required user approval for dbt command.',
          command: displayCmd,
        };
      }

      if (context) {
        const allowed = await TerminalConfirmGate.request({
          event: context.event,
          conversationId: context.conversationId,
          toolName,
          command: displayCmd,
          cwd: projectPath,
        });
        if (!allowed) {
          return {
            ok: false,
            command: displayCmd,
            error: 'Command denied by user',
          };
        }
      }
    }

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('cli:clear');
      mainWindow.webContents.send('cli:output', `> ${displayCmd}\n`);
    }

    return await new Promise((resolve) => {
      const child = spawn(dbtExe, args, {
        cwd: projectPath,
        shell: false,
      });

      let fullOutput = '';

      const handleData = (data: Buffer) => {
        const text = data.toString();
        fullOutput += text;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cli:output', text);
        }
      };

      child.stdout.on('data', handleData);
      child.stderr.on('data', handleData);

      child.on('error', (err) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cli:error', err.message);
          mainWindow.webContents.send('cli:done');
        }
        resolve({
          ok: false,
          command: displayCmd,
          error: err.message,
          exitCode: null,
          output: fullOutput,
          stdout: '',
          stderr: err.message,
        });
      });

      child.on('close', (code) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('cli:done', code);
        }
        if (code === 0) {
          resolve({
            ok: true,
            command: displayCmd,
            exitCode: 0,
            output: fullOutput,
          });
        } else {
          resolve({
            ok: false,
            command: displayCmd,
            error: `Command failed with code ${code}`,
            exitCode: code,
            output: fullOutput,
            stdout: fullOutput,
            stderr: '',
          });
        }
      });
    });
  } catch (error: any) {
    return {
      ok: false,
      command: `dbt ${normalizedCommand}`,
      error: error.message || 'Command failed',
      exitCode: typeof error.status === 'number' ? error.status : null,
      output: error.stdout || error.stderr || '',
      stdout: error.stdout || '',
      stderr: error.stderr || '',
    };
  }
}

/**
 * Validates that a file path is within the project root
 * Prevents directory traversal attacks
 */
function assertWithinProject(filePath: string, projectPath: string): void {
  const resolved = path.resolve(filePath);
  const projectRoot = path.resolve(projectPath);
  const relative = path.relative(projectRoot, resolved);
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Access denied: path must be within project root. Attempted: ${resolved}, Root: ${projectRoot}`,
    );
  }
}

/**
 * Read a dbt model, macro, schema, or config file from the project
 */
export const readDbtModel = tool({
  description:
    'Read a dbt model, macro, schema.yml, dbt_project.yml, or other configuration file from the project. Use this to understand existing models before making changes.',
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        'Absolute path to the file to read (e.g., /path/to/project/models/staging/stg_customers.sql)',
      ),
    projectPath: z
      .string()
      .describe('Absolute path to the dbt project root directory'),
  }),
  execute: async ({ filePath, projectPath }) => {
    // eslint-disable-next-line no-console
    console.log('[Tool][DBT] readDbtModel', { filePath, projectPath });
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
        filePath,
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
 * Write or update a dbt model SQL or YAML file
 */
export const writeDbtModel = tool({
  description:
    'Write or update a dbt model SQL file, schema.yml, or other configuration file. Always read the file first to understand its current state before modifying.',
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        'Absolute path to the file to write (must end in .sql, .yml, or .yaml)',
      ),
    content: z.string().describe('Complete file content to write'),
    projectPath: z
      .string()
      .describe('Absolute path to the dbt project root directory'),
  }),
  execute: async ({ filePath, content, projectPath }) => {
    // eslint-disable-next-line no-console
    console.log('[Tool][DBT] writeDbtModel', {
      filePath,
      contentLength: content?.length ?? 0,
      projectPath,
    });
    try {
      assertWithinProject(filePath, projectPath);

      // Only allow writing SQL and YAML files
      if (!/\.(sql|yml|yaml)$/i.test(filePath)) {
        return {
          error:
            'Only .sql, .yml, and .yaml files can be written. Other file types are not permitted.',
        };
      }

      const context = AgentService.currentAgentContext;
      if (context) {
        // File writes don't require confirmation — only shell commands do.
        // The write is shown in the UI via AgentStepBlock and can be reverted.
      }

      // Ensure directory exists
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        filePath,
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
 * Run a dbt CLI command
 */
export const runDbtCommand = tool({
  description:
    'Execute a dbt CLI command such as run, test, compile, or docs generate. Use --select to target specific models. Always check logs after running commands to verify success.',
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        'dbt subcommand to run (e.g., "run", "test", "compile", "docs generate")',
      ),
    select: z
      .string()
      .optional()
      .describe(
        'Model selector pattern (e.g., "my_model", "my_model+", "tag:daily")',
      ),
    projectPath: z
      .string()
      .describe('Absolute path to the dbt project root directory'),
    extraArgs: z
      .string()
      .optional()
      .describe('Additional CLI arguments (e.g., "--full-refresh")'),
  }),
  execute: async ({ command, select, projectPath, extraArgs }) => {
    // eslint-disable-next-line no-console
    console.log('[Tool][DBT] runDbtCommand', {
      command,
      select,
      projectPath,
      extraArgs,
    });
    try {
      // Validate command is in allowed list
      const baseCommand = command.split(' ')[0];
      if (!ALLOWED_DBT_COMMANDS.includes(baseCommand)) {
        return {
          error: `Command not permitted: ${baseCommand}. Allowed commands: ${ALLOWED_DBT_COMMANDS.join(', ')}`,
        };
      }

      const adapterCheck =
        await DbtCoreVersionService.checkProjectAdapterCompatibility(
          projectPath,
        );
      if (!adapterCheck.adapter.canExecute) {
        return {
          success: false,
          error: `dbt command blocked: ${adapterCheck.adapter.notes}`,
          adapter: adapterCheck.adapter,
        };
      }

      // Resolve dbt executable from app-managed venv
      const dbtExe = await SettingsService.getDbtExePath();

      const args: string[] = command.split(' ').filter(Boolean);
      if (select) {
        args.push('--select', select);
      }
      if (extraArgs) {
        const parsed = extraArgs.match(/(?:[^\s"']+|(["'])[^\1]*?\1)+/g);
        if (parsed) {
          args.push(
            ...parsed.map((p) => {
              if (
                (p.startsWith('"') && p.endsWith('"')) ||
                (p.startsWith("'") && p.endsWith("'"))
              ) {
                return p.slice(1, -1);
              }
              return p;
            }),
          );
        }
      }

      const displayCmd = `"${dbtExe}" ${args.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;

      const context = AgentService.currentAgentContext;
      if (context) {
        const allowed = await TerminalConfirmGate.request({
          event: context.event,
          conversationId: context.conversationId,
          toolName: 'runDbtCommand',
          command: displayCmd,
          cwd: projectPath,
        });
        if (!allowed) {
          return {
            success: false,
            command: displayCmd,
            error: 'Command denied by user',
          };
        }
      }

      // Execute with timeout
      const output = execFileSync(dbtExe, args, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: COMMAND_TIMEOUT,
        maxBuffer: 1024 * 1024 * 10, // 10 MB buffer
        shell: false,
      });

      return {
        success: true,
        command: displayCmd,
        exitCode: 0,
        output,
      };
    } catch (error: any) {
      return {
        success: false,
        command: `dbt ${command}`,
        error: error.message || 'Command execution failed',
        exitCode: typeof error.status === 'number' ? error.status : null,
        output: error.stdout || error.stderr || '',
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
});

/**
 * List all dbt models in the project
 */
export const listDbtModels = tool({
  description:
    'List all dbt model files (.sql) in the project, optionally filtered by name pattern. Useful for discovering available models before reading or modifying them.',
  inputSchema: z.object({
    projectPath: z
      .string()
      .describe('Absolute path to the dbt project root directory'),
    filter: z
      .string()
      .optional()
      .describe(
        'Optional filter pattern to match model names (case-insensitive substring match)',
      ),
  }),
  execute: async ({ projectPath, filter }) => {
    try {
      const modelsDir = path.join(projectPath, 'models');
      if (!fs.existsSync(modelsDir)) {
        return {
          error: `Models directory not found: ${modelsDir}`,
          models: [],
        };
      }

      // Recursively find all .sql files
      const findModels = (dir: string): string[] => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        return entries.flatMap((entry) => {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            return findModels(fullPath);
          }
          if (entry.name.endsWith('.sql')) {
            return [fullPath];
          }
          return [];
        });
      };

      let models = findModels(modelsDir);

      // Apply filter if provided
      if (filter) {
        const lowerFilter = filter.toLowerCase();
        models = models.filter((m) =>
          path.basename(m).toLowerCase().includes(lowerFilter),
        );
      }

      // Convert to relative paths for readability
      const relativeModels = models.map((m) => path.relative(projectPath, m));

      return {
        success: true,
        count: models.length,
        models: relativeModels,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error listing models',
        models: [],
      };
    }
  },
});

/**
 * Read recent dbt run logs
 */
export const getDbtLogs = tool({
  description:
    'Read recent dbt run logs to diagnose errors or understand what happened during the last dbt command execution. Essential for debugging failed runs.',
  inputSchema: z.object({
    projectPath: z
      .string()
      .describe('Absolute path to the dbt project root directory'),
    lines: z
      .number()
      .int()
      .min(10)
      .max(500)
      .default(100)
      .describe('Number of recent log lines to read (default: 100)'),
  }),
  execute: async ({ projectPath, lines }) => {
    try {
      const logPath = path.join(projectPath, 'logs', 'dbt.log');

      if (!fs.existsSync(logPath)) {
        return {
          error: 'No dbt.log found. Run a dbt command first to generate logs.',
          content: '',
        };
      }

      const content = fs.readFileSync(logPath, 'utf-8');
      const allLines = content.split('\n');
      const recentLines = allLines.slice(-lines).join('\n');

      return {
        success: true,
        logPath,
        totalLines: allLines.length,
        returnedLines: lines,
        content: recentLines,
      };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : 'Unknown error reading logs',
        content: '',
      };
    }
  },
});

/**
 * Export all dbt tools as a single object for easy registration
 */
export const dbtTools = {
  readDbtModel,
  writeDbtModel,
  runDbtCommand,
  listDbtModels,
  getDbtLogs,
};

/**
 * Creates dbt tools with projectPath pre-bound.
 * The agent never needs to pass projectPath — it's injected at creation time.
 */
export function createDbtTools(
  projectPath: string,
  onFileWritten?: (filePath: string) => void,
  mainWindow?: BrowserWindow,
) {
  return {
    readDbtModel: tool({
      description:
        'Read a dbt model, macro, schema.yml, dbt_project.yml, or other config file from the project.',
      inputSchema: z.object({
        filePath: z
          .string()
          .describe(
            `Absolute path to the file to read. Must be inside ${projectPath}`,
          ),
      }),
      execute: async ({ filePath }) => {
        try {
          assertWithinProject(filePath, projectPath);
          if (!fs.existsSync(filePath))
            return { error: `File not found: ${filePath}` };
          const stat = fs.statSync(filePath);
          if (stat.size > MAX_FILE_SIZE)
            return { error: `File too large (${stat.size} bytes)` };
          return {
            success: true,
            filePath,
            content: fs.readFileSync(filePath, 'utf-8'),
            size: stat.size,
          };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error reading file',
          };
        }
      },
    }),

    writeDbtModel: tool({
      description:
        'Write or update a dbt model SQL file, schema.yml, or other config file.',
      inputSchema: z.object({
        filePath: z
          .string()
          .describe(
            `Absolute path to the file to write (must end in .sql, .yml, or .yaml). Must be inside ${projectPath}`,
          ),
        content: z.string().describe('Complete file content to write'),
      }),
      execute: async ({ filePath, content }) => {
        try {
          assertWithinProject(filePath, projectPath);
          if (!/\.(sql|yml|yaml)$/i.test(filePath))
            return {
              error: 'Only .sql, .yml, and .yaml files can be written.',
            };

          const context = AgentService.currentAgentContext;
          if (context) {
            // File writes don't require confirmation — only shell commands do.
          }
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, content, 'utf-8');
          onFileWritten?.(filePath);
          return {
            success: true,
            filePath,
            bytesWritten: Buffer.byteLength(content, 'utf-8'),
          };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error writing file',
          };
        }
      },
    }),

    runDbtCommand: tool({
      description:
        'Execute a dbt CLI command such as run, test, compile, or docs generate.',
      inputSchema: z.object({
        command: z
          .string()
          .describe(
            'dbt subcommand (e.g., "run", "test", "compile", "docs generate")',
          ),
        select: z
          .string()
          .optional()
          .describe('Model selector (e.g., "my_model", "my_model+")'),
        extraArgs: z
          .string()
          .optional()
          .describe('Additional CLI arguments (e.g., "--full-refresh")'),
      }),
      execute: async ({ command, select, extraArgs }) => {
        return executeDbtCommand({
          command,
          select,
          extraArgs,
          projectPath,
          mainWindow,
          toolName: 'runDbtCommand',
          requireApproval: true,
          strictApproval: false,
        });
      },
    }),

    listDbtModels: tool({
      description: 'List all dbt model files (.sql) in the project.',
      inputSchema: z.object({
        filter: z
          .string()
          .optional()
          .describe(
            'Optional filter pattern (case-insensitive substring match)',
          ),
      }),
      execute: async ({ filter }) => {
        try {
          const modelsDir = path.join(projectPath, 'models');
          if (!fs.existsSync(modelsDir))
            return {
              error: `Models directory not found: ${modelsDir}`,
              models: [],
            };
          const findModels = (dir: string): string[] =>
            fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
              const fullPath = path.join(dir, entry.name);
              if (entry.isDirectory()) return findModels(fullPath);
              if (entry.name.endsWith('.sql')) return [fullPath];
              return [];
            });
          let models = findModels(modelsDir);
          if (filter)
            models = models.filter((m) =>
              path.basename(m).toLowerCase().includes(filter.toLowerCase()),
            );
          return {
            success: true,
            count: models.length,
            models: models.map((m) => path.relative(projectPath, m)),
          };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error listing models',
            models: [],
          };
        }
      },
    }),

    getDbtLogs: tool({
      description: 'Read recent dbt run logs to diagnose errors.',
      inputSchema: z.object({
        lines: z
          .number()
          .int()
          .min(10)
          .max(500)
          .default(100)
          .describe('Number of recent log lines to read'),
      }),
      execute: async ({ lines }) => {
        try {
          const logPath = path.join(projectPath, 'logs', 'dbt.log');
          if (!fs.existsSync(logPath))
            return {
              error: 'No dbt.log found. Run a dbt command first.',
              content: '',
            };
          const content = fs.readFileSync(logPath, 'utf-8');
          const allLines = content.split('\n');
          return {
            success: true,
            logPath,
            totalLines: allLines.length,
            returnedLines: lines,
            content: allLines.slice(-lines).join('\n'),
          };
        } catch (error) {
          return {
            error:
              error instanceof Error
                ? error.message
                : 'Unknown error reading logs',
            content: '',
          };
        }
      },
    }),
  };
}
