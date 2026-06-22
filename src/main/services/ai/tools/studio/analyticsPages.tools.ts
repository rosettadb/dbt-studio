import { tool } from 'ai';
import { z } from 'zod';
import AgentService from '../../../agent.service';
import { AnalyticsPagesService } from '../../../analyticsPages.service';

function getAnalyticsContextResult(conversationId: number):
  | {
      ok: true;
      context: NonNullable<ReturnType<typeof AgentService.getAgentContext>>;
    }
  | { ok: false; error: string } {
  const context = AgentService.getAgentContext(conversationId);
  if (!context) {
    return {
      ok: false,
      error: `No active context for conversation ${conversationId}`,
    };
  }
  if (context.screenKey !== 'analytics') {
    return {
      ok: false,
      error: `Analytics page tools require the Analytics screen (current: ${context.screenKey})`,
    };
  }
  if (!context.connectionId) {
    return {
      ok: false,
      error:
        'Analytics page tools require an active connectionId. Select an Analytics page from a database connection and try again.',
    };
  }
  if (!context.pageId) {
    return {
      ok: false,
      error:
        'Analytics page tools require an active pageId. Select an Analytics page and try again.',
    };
  }
  return { ok: true, context };
}

function resolveConnectionIdResult(
  conversationId: number,
  requestedConnectionId?: string,
): { ok: true; connectionId: string } | { ok: false; error: string } {
  const contextResult = getAnalyticsContextResult(conversationId);
  if (!contextResult.ok) return contextResult;

  const activeConnectionId = contextResult.context.connectionId;
  if (!activeConnectionId) {
    return {
      ok: false,
      error: 'Analytics page tools require an active connectionId',
    };
  }
  if (requestedConnectionId && requestedConnectionId !== activeConnectionId) {
    return {
      ok: false,
      error: `Requested connectionId does not match the active Analytics connection (${activeConnectionId})`,
    };
  }
  return { ok: true, connectionId: activeConnectionId };
}

function extractSqlBlockNames(markdownContent: string): string[] {
  const names = new Set<string>();
  const regex = /^```sql\s+([A-Za-z_][A-Za-z0-9_]*)/gm;
  let match = regex.exec(markdownContent);
  while (match) {
    names.add(match[1]);
    match = regex.exec(markdownContent);
  }
  return [...names];
}

function extractComponentNames(markdownContent: string): string[] {
  const names = new Set<string>();
  const regex = /<([A-Z][A-Za-z0-9]*)\b/g;
  let match = regex.exec(markdownContent);
  while (match) {
    names.add(match[1]);
    match = regex.exec(markdownContent);
  }
  return [...names];
}

export function createStudioAnalyticsPagesTools(conversationId: number) {
  return {
    analytics_active_page_read: tool({
      description:
        'Read the live Monaco Markdown content for the active Analytics page. Use this for the currently open page, including unsaved editor changes. Does not require connectionId or pageId.',
      inputSchema: z.object({}),
      execute: async () => {
        const contextResult = getAnalyticsContextResult(conversationId);
        if (!contextResult.ok) return contextResult;
        return AgentService.requestAnalyticsEditorRead(conversationId);
      },
    }),

    analytics_active_page_write: tool({
      description:
        'Overwrite the live Monaco Markdown content for the active Analytics page. Use only after analytics_active_page_read.',
      inputSchema: z.object({ markdownContent: z.string() }),
      execute: async ({ markdownContent }) => {
        const contextResult = getAnalyticsContextResult(conversationId);
        if (!contextResult.ok) return contextResult;
        return AgentService.requestAnalyticsEditorUpdate(
          conversationId,
          markdownContent,
        );
      },
    }),

    analytics_active_page_run: tool({
      description:
        'Run all SQL blocks in the active Analytics page UI and wait for the UI run request to complete.',
      inputSchema: z.object({}),
      execute: async () => {
        const contextResult = getAnalyticsContextResult(conversationId);
        if (!contextResult.ok) return contextResult;
        return AgentService.requestAnalyticsEditorRun(conversationId);
      },
    }),

    analytics_active_page_get_results: tool({
      description:
        'Read active Analytics preview/query statuses, errors, durations, row counts, columns, and compact row previews. Does not re-run queries.',
      inputSchema: z.object({}),
      execute: async () => {
        const contextResult = getAnalyticsContextResult(conversationId);
        if (!contextResult.ok) return contextResult;
        return AgentService.requestAnalyticsEditorResults(conversationId);
      },
    }),

    analytics_pages_list: tool({
      description:
        'List stored Analytics pages for the active database connection. Returns metadata and detected SQL/component names, not full markdown.',
      inputSchema: z.object({
        connectionId: z.string().optional(),
      }),
      execute: async ({ connectionId }) => {
        const connectionResult = resolveConnectionIdResult(
          conversationId,
          connectionId,
        );
        if (!connectionResult.ok) return connectionResult;
        const pages = await AnalyticsPagesService.list(
          connectionResult.connectionId,
        );
        return pages.map((page) => ({
          id: page.id,
          title: page.title,
          routePath: page.routePath,
          connectionId: page.connectionId,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
          sqlBlocks: extractSqlBlockNames(page.markdownContent),
          components: extractComponentNames(page.markdownContent),
        }));
      },
    }),

    analytics_page_db_read: tool({
      description:
        'Read a stored Analytics page by pageId for the active connection. Use for non-active pages as reference context. For the active page, prefer analytics_active_page_read.',
      inputSchema: z.object({
        pageId: z.string(),
        connectionId: z.string().optional(),
      }),
      execute: async ({ pageId, connectionId }) => {
        const contextResult = getAnalyticsContextResult(conversationId);
        if (!contextResult.ok) return contextResult;
        const connectionResult = resolveConnectionIdResult(
          conversationId,
          connectionId,
        );
        if (!connectionResult.ok) return connectionResult;

        if (pageId === contextResult.context.pageId) {
          return {
            warning:
              'Requested pageId is the active page. Use analytics_active_page_read for live Monaco content, including unsaved changes.',
            activePage: true,
          };
        }

        const page = await AnalyticsPagesService.get(
          connectionResult.connectionId,
          pageId,
        );
        return {
          id: page.id,
          title: page.title,
          routePath: page.routePath,
          connectionId: page.connectionId,
          markdownContent: page.markdownContent,
          createdAt: page.createdAt,
          updatedAt: page.updatedAt,
        };
      },
    }),
  };
}
