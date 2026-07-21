import { tool } from 'ai';
import type { BrowserWindow } from 'electron';
import { z } from 'zod';

import { executeDbtCommand } from '../dbt.tools';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_CLI_RUN_DBT_FLAG = 'studio.cli.run_dbt';
const PHASE_19_ALLOWED_COMMANDS = [
  'run',
  'test',
  'compile',
  'deps',
  'seed',
  'debug',
  'docs generate',
  'source freshness',
];
const ALLOWED_COMMAND_DESCRIPTION =
  'Allowed dbt command: run, test, compile, deps, seed, debug, docs generate, or source freshness';

const studioCliRunDbtInputSchema = z.object({
  command: z
    .string()
    .refine((command) => PHASE_19_ALLOWED_COMMANDS.includes(command), {
      message: ALLOWED_COMMAND_DESCRIPTION,
    })
    .describe(ALLOWED_COMMAND_DESCRIPTION),
  select: z
    .string()
    .optional()
    .describe(
      'Optional dbt selector (e.g., "my_model", "tag:daily", "my_model+")',
    ),
  extraArgs: z
    .string()
    .optional()
    .describe('Optional additional dbt arguments (for advanced use cases)'),
});

type StudioCliRunDbtInput = z.infer<typeof studioCliRunDbtInputSchema>;

export function createStudioCliTools(options: {
  projectPath?: string;
  conversationId?: number;
  mainWindow?: BrowserWindow;
}): Record<string, any> {
  const { projectPath, conversationId, mainWindow } = options;
  const cliEnabled = isToolEnabled(STUDIO_CLI_RUN_DBT_FLAG);

  if (!cliEnabled || !projectPath) {
    return {};
  }

  return {
    studio_cli_run_dbt: tool({
      description:
        'Run an approved dbt CLI command for the active project. Always requires explicit user approval before execution.',
      inputSchema: studioCliRunDbtInputSchema as any,
      execute: async ({ command, select, extraArgs }: StudioCliRunDbtInput) => {
        const startedAt = Date.now();

        try {
          const result = await executeDbtCommand({
            command,
            select,
            extraArgs,
            projectPath,
            conversationId,
            mainWindow,
            toolName: 'studio_cli_run_dbt',
            requireApproval: true,
            strictApproval: true,
            allowedCommands: PHASE_19_ALLOWED_COMMANDS,
          });

          if (!result?.ok) {
            return {
              ok: false,
              error: result?.error ?? 'dbt command failed',
              data: {
                command: result?.command ?? command,
                exitCode: result?.exitCode ?? null,
                output: result?.output ?? result?.stdout ?? '',
                stdout: result?.stdout ?? '',
                stderr: result?.stderr ?? '',
              },
              meta: {
                duration: Date.now() - startedAt,
              },
            };
          }

          return {
            ok: true,
            data: {
              command: result.command,
              exitCode: result.exitCode ?? 0,
              output: result.output ?? '',
            },
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to execute dbt command',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    }),
  };
}
