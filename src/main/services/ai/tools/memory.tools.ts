import { tool } from 'ai';
import { z } from 'zod';
import AgentMemoryService from '../../agentMemory.service';
import {
  AgentMemoryScope,
  MEMORY_KIND,
  MemoryKind,
} from '../../../../types/backend';

const MEMORY_KIND_VALUES = Object.values(MEMORY_KIND) as [
  MemoryKind,
  ...MemoryKind[],
];

function summarizeMemoryContent(content: string, maxChars = 700): string {
  return content.length > maxChars
    ? `${content.slice(0, maxChars - 3).trimEnd()}...`
    : content;
}

export function createMemoryTools(scope: AgentMemoryScope) {
  return {
    memory_search: tool({
      description:
        'Search scoped long-term memory for prior decisions, conventions, user preferences, saved analysis, previous errors, or project history.',
      inputSchema: z.object({
        query: z.string().min(1),
        kind: z.enum(MEMORY_KIND_VALUES).optional(),
        limit: z.number().int().min(1).max(20).default(8),
        corpus: z.enum(['memory', 'wiki', 'all']).default('memory'),
      }),
      execute: async ({ query, kind, limit, corpus }) => {
        const memResultsP =
          corpus === 'memory' || corpus === 'all'
            ? AgentMemoryService.searchEntries({ ...scope, query, kind, limit })
            : Promise.resolve([]);

        let wikiResultsP: Promise<Array<any>> = Promise.resolve([]);
        if (corpus === 'wiki' || corpus === 'all') {
          const mod = await import('../../agentMemoryWiki.service');
          wikiResultsP = mod.default.searchWiki({
            ...scope,
            query,
            kind,
            limit,
          });
        }

        const [memResults, wikiResults] = await Promise.all([
          memResultsP,
          wikiResultsP,
        ]);

        const merged: any[] = [];
        const seenIds = new Set<number>();

        memResults.forEach((entry: any) => {
          merged.push({
            id: entry.id,
            corpus: 'memory',
            kind: entry.kind,
            title: entry.title,
            summary: entry.summary ?? summarizeMemoryContent(entry.content),
            score: entry.score,
            updatedAt: entry.updatedAt,
            matchSource: entry.matchSource,
          });
          seenIds.add(entry.id);
        });

        wikiResults.forEach((entry: any) => {
          if (!seenIds.has(entry.id)) {
            merged.push({
              id: entry.id,
              corpus: 'wiki',
              kind: entry.kind,
              title: entry.title,
              excerpt: entry.excerpt,
              score: entry.score,
            });
            seenIds.add(entry.id);
          } else if (corpus === 'all') {
            const existing = merged.find((m) => m.id === entry.id);
            if (existing) {
              existing.corpus = 'all';
              existing.excerpt = entry.excerpt;
            }
          }
        });

        // Lower BM25 score means more relevant
        merged.sort((a, b) => a.score - b.score);

        return {
          ok: true,
          count: merged.length,
          memories: merged.slice(0, limit),
        };
      },
    }),

    memory_status: tool({
      description:
        'Show memory status for this scope, including durable counts, short-term counts, health, and last dreaming run.',
      inputSchema: z.object({}),
      execute: async () => {
        const [stats, health, scopedEntries] = await Promise.all([
          AgentMemoryService.getStats(),
          AgentMemoryService.getHealth(),
          AgentMemoryService.listEntries({ ...scope, limit: 20 }),
        ]);

        return {
          ok: true,
          scopedSampleCount: scopedEntries.length,
          scopedSampleLimit: 20,
          stats,
          health,
        };
      },
    }),

    memory_remember: tool({
      description:
        'Save a durable memory in the current scope. Use only when the user explicitly asks to remember something, or when the information is clearly durable and useful across future sessions. Never save secrets or credentials.',
      inputSchema: z.object({
        content: z.string().min(1),
        title: z.string().optional(),
        kind: z.enum(MEMORY_KIND_VALUES).default(MEMORY_KIND.MANUAL),
        tags: z.array(z.string()).max(12).optional(),
      }),
      execute: async ({ content, title, kind, tags }) => {
        const entry = await AgentMemoryService.createEntry({
          ...scope,
          kind,
          sourceType: 'manual',
          sourceId: `tool:memory_remember:${Date.now()}`,
          title: title ?? 'Manual memory',
          content,
          tags,
          importance: 0.8,
          confidence: 0.9,
        });

        return {
          ok: true,
          id: entry.id,
          kind: entry.kind,
          title: entry.title,
        };
      },
    }),

    memory_forget: tool({
      description:
        'Archive a memory by ID when the user explicitly asks to forget, remove, archive, or correct stale memory.',
      inputSchema: z.object({
        id: z.number().int().positive(),
        reason: z.string().optional(),
      }),
      execute: async ({ id, reason }) => {
        const entry = await AgentMemoryService.getScopedEntryById(id, scope);
        if (!entry) {
          return {
            ok: false,
            error: `Memory entry ${id} was not found in this scope or is already archived.`,
          };
        }

        await AgentMemoryService.archiveEntry(id);
        return {
          ok: true,
          archivedId: id,
          kind: entry.kind,
          title: entry.title,
          reason: reason ?? null,
        };
      },
    }),
  };
}
