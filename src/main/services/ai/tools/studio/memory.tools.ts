import { tool } from 'ai';
import { z } from 'zod';
import fs from 'fs-extra';
import {
  readMemoryFile,
  writeMemoryFile,
  searchMemory,
  resolveSafePath,
} from '../../memory/memoryService';

export function createMemoryTools() {
  const memoryTool = tool({
    description: `Read, search, create, update, edit, or delete the agent's persistent memory.
Memory stores rules, skills, preferences, and knowledge across all sessions.
Always search memory before starting a task that might depend on past context.`,
    inputSchema: z.object({
      command: z.enum(['view', 'create', 'update', 'delete', 'edit', 'search']),
      path: z.string().optional().describe('File path relative to .memory/'),
      content: z.string().optional().describe('Content for create/update'),
      query: z.string().optional().describe('Search term (for search command)'),
      mode: z
        .enum(['append', 'overwrite'])
        .optional()
        .default('append')
        .describe('Write mode for update command'),
      oldString: z
        .string()
        .optional()
        .describe('Text to replace (for edit command)'),
      newString: z
        .string()
        .optional()
        .describe('Replacement text (for edit command)'),
    }),
    execute: async ({
      command,
      path: filePath,
      content,
      query,
      mode,
      oldString,
      newString,
    }) => {
      switch (command) {
        case 'view': {
          if (!filePath) return { ok: false, error: 'path required for view' };
          const text = await readMemoryFile(filePath);
          return { ok: true, output: text };
        }
        case 'search': {
          if (!query) return { ok: false, error: 'query required for search' };
          const results = await searchMemory(query);
          return { ok: true, output: results };
        }
        case 'create': {
          if (!filePath || !content) {
            return { ok: false, error: 'path and content required for create' };
          }
          await writeMemoryFile(filePath, content, 'overwrite');
          return { ok: true, output: `Created ${filePath}` };
        }
        case 'update': {
          if (!filePath || !content) {
            return { ok: false, error: 'path and content required for update' };
          }
          await writeMemoryFile(filePath, content, mode ?? 'append');
          return {
            ok: true,
            output: `Updated ${filePath} (${mode ?? 'append'})`,
          };
        }
        case 'edit': {
          if (!filePath || !oldString || !newString) {
            return {
              ok: false,
              error: 'path, oldString, and newString required for edit',
            };
          }
          const existing = await readMemoryFile(filePath);
          if (!existing.includes(oldString)) {
            return {
              ok: false,
              error: `oldString not found in ${filePath}`,
            };
          }
          const updated = existing.replace(oldString, newString);
          await writeMemoryFile(filePath, updated, 'overwrite');
          return {
            ok: true,
            output: `Edited ${filePath}: replaced "${oldString}" → "${newString}"`,
          };
        }
        case 'delete': {
          if (!filePath) {
            return { ok: false, error: 'path required for delete' };
          }
          const abs = resolveSafePath(filePath);
          await fs.remove(abs);
          return { ok: true, output: `Deleted ${filePath}` };
        }
        default:
          return { ok: false, error: `Unknown command: ${command}` };
      }
    },
  });

  return { memory: memoryTool };
}
