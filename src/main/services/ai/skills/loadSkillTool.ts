import { tool } from 'ai';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SkillMetadata } from './skillsDiscovery';

function stripFrontmatter(content: string): string {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length).trim() : content.trim();
}

/**
 * Creates the loadSkill tool dynamically based on discovered skills.
 */
export function createLoadSkillTool(availableSkills: SkillMetadata[]) {
  return tool({
    description:
      'Load a skill to get specialized instructions. Use this when the user request matches an available skill.',
    inputSchema: z.object({
      name: z.string().describe('The skill name to load'),
    }),
    execute: async ({ name }) => {
      const skill = availableSkills.find(
        (s) => s.name.toLowerCase() === name.toLowerCase(),
      );

      if (!skill) return { error: `Skill '${name}' not found.` };

      const skillFile = path.join(skill.path, 'SKILL.md');

      try {
        const content = await fs.readFile(skillFile, 'utf-8');
        const body = stripFrontmatter(content);

        return {
          skillDirectory: skill.path, // Expose path so agent knows where sibling files are
          content: body,
        };
      } catch (err: any) {
        return { error: `Failed to load skill '${name}': ${err.message}` };
      }
    },
  });
}
