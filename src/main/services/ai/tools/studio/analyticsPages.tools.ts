import { tool } from 'ai';
import { z } from 'zod';
import AgentService from '../../../agent.service';
import { AnalyticsPagesService } from '../../../analyticsPages.service';

function getAnalyticsContext(conversationId: number) {
  const context = AgentService.getAgentContext(conversationId);
  if (!context) {
    throw new Error(`No active context for conversation ${conversationId}`);
  }
  if (context.screenKey !== 'analytics') {
    throw new Error(
      `Analytics page tools require the Analytics screen (current: ${context.screenKey})`,
    );
  }
  if (!context.connectionId) {
    throw new Error('Analytics page tools require an active connectionId');
  }
  if (!context.pageId) {
    throw new Error('Analytics page tools require an active pageId');
  }
  return context;
}

function resolveConnectionId(
  conversationId: number,
  requestedConnectionId?: string,
): string {
  const context = getAnalyticsContext(conversationId);
  const activeConnectionId = context.connectionId;
  if (!activeConnectionId) {
    throw new Error('Analytics page tools require an active connectionId');
  }
  if (requestedConnectionId && requestedConnectionId !== activeConnectionId) {
    throw new Error(
      `Requested connectionId does not match the active Analytics connection (${activeConnectionId})`,
    );
  }
  return activeConnectionId;
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
        getAnalyticsContext(conversationId);
        return AgentService.requestAnalyticsEditorRead(conversationId);
      },
    }),

    analytics_active_page_write: tool({
      description:
        'Overwrite the live Monaco Markdown content for the active Analytics page. Use only after analytics_active_page_read.',
      inputSchema: z.object({ markdownContent: z.string() }),
      execute: async ({ markdownContent }) => {
        getAnalyticsContext(conversationId);
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
        getAnalyticsContext(conversationId);
        return AgentService.requestAnalyticsEditorRun(conversationId);
      },
    }),

    analytics_active_page_get_results: tool({
      description:
        'Read active Analytics preview/query statuses, errors, durations, row counts, columns, and compact row previews. Does not re-run queries.',
      inputSchema: z.object({}),
      execute: async () => {
        getAnalyticsContext(conversationId);
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
        const activeConnectionId = resolveConnectionId(
          conversationId,
          connectionId,
        );
        const pages = await AnalyticsPagesService.list(activeConnectionId);
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
        const context = getAnalyticsContext(conversationId);
        const activeConnectionId = resolveConnectionId(
          conversationId,
          connectionId,
        );

        if (pageId === context.pageId) {
          return {
            warning:
              'Requested pageId is the active page. Use analytics_active_page_read for live Monaco content, including unsaved changes.',
            activePage: true,
          };
        }

        const page = await AnalyticsPagesService.get(
          activeConnectionId,
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
