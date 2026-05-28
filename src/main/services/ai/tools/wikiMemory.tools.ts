import { tool } from 'ai';
import { z } from 'zod';
import {
  AgentMemoryScope,
  MEMORY_KIND,
  MemoryKind,
} from '../../../../types/backend';
import AgentMemoryWikiService from '../../agentMemoryWiki.service';
import { loadAISettings } from '../../agent.service';

const MEMORY_KIND_VALUES = Object.values(MEMORY_KIND) as [
  MemoryKind,
  ...MemoryKind[],
];

export async function createWikiTools(scope: AgentMemoryScope) {
  const settings = await loadAISettings();
  const wiki = settings.memory?.wiki;

  if (!wiki?.enabled || !wiki.vaultPath) {
    return {};
  }

  return {
    wiki_search: tool({
      description:
        'Search the generated Obsidian Wiki memory corpus. Returns Markdown formatted excerpts exactly as they appear in the managed wiki blocks.',
      inputSchema: z.object({
        query: z.string().min(1),
        kind: z.enum(MEMORY_KIND_VALUES).optional(),
        limit: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ query, kind, limit }) => {
        const results = await AgentMemoryWikiService.searchWiki({
          ...scope,
          query,
          kind,
          limit,
        });

        return {
          ok: true,
          count: results.length,
          excerpts: results,
        };
      },
    }),

    wiki_get: tool({
      description:
        'Get the full generated markdown file (managed block) for the current scope. This allows you to read exactly what is exported to the Obsidian vault.',
      inputSchema: z.object({}),
      execute: async () => {
        const markdown = await AgentMemoryWikiService.getWikiFile(scope);
        return {
          ok: true,
          markdown,
        };
      },
    }),

    wiki_status: tool({
      description:
        'Show the status of the Wiki compiler queue, contradiction linting, and export health.',
      inputSchema: z.object({}),
      execute: async () => {
        const status = await AgentMemoryWikiService.getStatus();
        const lint = await AgentMemoryWikiService.lintScope(scope);

        return {
          ok: true,
          status,
          currentScopeLint: lint,
        };
      },
    }),
  };
}
