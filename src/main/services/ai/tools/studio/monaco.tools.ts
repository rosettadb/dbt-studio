import { tool } from 'ai';
import { z } from 'zod';

import AgentService from '../../../agent.service';
import { truncateToolResult } from '../../tokenEstimator';
import { isToolEnabled } from '../toolRegistry';

const STUDIO_MONACO_READ_FLAG = 'studio.monaco.read';
const STUDIO_MONACO_UPDATE_FLAG = 'studio.monaco.update';
const DEFAULT_MAX_OUTPUT_TOKENS = 3_000;

export function createStudioMonacoTools(conversationId: number) {
  const monacoReadEnabled = isToolEnabled(STUDIO_MONACO_READ_FLAG);
  const monacoUpdateEnabled = isToolEnabled(STUDIO_MONACO_UPDATE_FLAG);
  if (!monacoReadEnabled && !monacoUpdateEnabled) {
    return {};
  }

  const tools: Record<string, any> = {};

  if (monacoReadEnabled) {
    tools.studio_monaco_read = tool({
      description:
        'Read the current SQL text from the active Monaco editor in the SQL screen.',
      inputSchema: z.object({}),
      execute: async () => {
        const startedAt = Date.now();
        try {
          const response =
            await AgentService.requestSqlEditorRead(conversationId);

          if (!response.success) {
            return {
              ok: false,
              error: response.error || 'Failed to read SQL editor content',
              meta: {
                duration: Date.now() - startedAt,
              },
            };
          }

          const content = response.content ?? '';
          const payload = {
            content,
            length: content.length,
          };
          const raw = JSON.stringify(payload);
          const output = truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS);
          const truncated = output !== raw;

          return {
            ok: true,
            ...(truncated ? {} : { data: payload }),
            output,
            meta: {
              duration: Date.now() - startedAt,
              contentLength: content.length,
              truncated,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to read SQL editor',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  if (monacoUpdateEnabled) {
    tools.studio_monaco_update = tool({
      description:
        'Update or replace SQL text in the active Monaco editor tab. This updates editor content only and does not execute queries.',
      inputSchema: z.object({
        content: z
          .string()
          .describe('Full SQL text to set in the active Monaco editor tab'),
      }),
      execute: async ({ content }) => {
        const startedAt = Date.now();
        try {
          // Always replace — never silently append. The tool description says
          // "Update or replace SQL text" and the agent must be able to trust
          // that the editor contains exactly what it wrote.
          const response = await AgentService.requestSqlEditorUpdate(
            conversationId,
            content,
          );

          if (!response.success || !response.applied) {
            return {
              ok: false,
              error: response.error || 'Failed to update SQL editor content',
              meta: {
                duration: Date.now() - startedAt,
                applied: !!response.applied,
              },
            };
          }

          const payload = {
            applied: true,
            contentLength: content.length,
          };
          const raw = JSON.stringify(payload);
          const output = truncateToolResult(raw, DEFAULT_MAX_OUTPUT_TOKENS);
          const truncated = output !== raw;

          return {
            ok: true,
            ...(truncated ? {} : { data: payload }),
            output,
            meta: {
              duration: Date.now() - startedAt,
              applied: true,
              contentLength: content.length,
              truncated,
            },
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to update SQL editor',
            meta: {
              duration: Date.now() - startedAt,
            },
          };
        }
      },
    });
  }

  return tools;
}
