import { tool } from 'ai';
import { z } from 'zod';
import { AnalyticsPagesService } from '../../../analyticsPages.service';

export function createStudioAnalyticsPagesTools() {
  return {
    analytics_page_read: tool({
      description:
        'Read the full Markdown content of an Analytics page by its ID.',
      inputSchema: z.object({ connectionId: z.string(), pageId: z.string() }),
      execute: async ({ connectionId, pageId }) => {
        // Uses get() instead of list() to avoid loading all pages from disk.
        // list() would deserialize all markdownContent fields — wasteful for a single lookup.
        const page = await AnalyticsPagesService.get(connectionId, pageId);
        return {
          routePath: page.routePath,
          markdownContent: page.markdownContent,
        };
      },
    }),

    analytics_page_write: tool({
      description: 'Overwrite the full Markdown content of an Analytics page.',
      inputSchema: z.object({
        connectionId: z.string(),
        pageId: z.string(),
        markdownContent: z.string(),
      }),
      execute: async ({ connectionId, pageId, markdownContent }) =>
        AnalyticsPagesService.update(connectionId, pageId, { markdownContent }),
    }),
  };
}
