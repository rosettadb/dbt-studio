import * as fs from 'fs/promises';
import * as path from 'path';
import { ensureSkillsDirectory } from './skillsStorage';

export interface SkillMetadata {
  name: string;
  description: string;
  path: string;
}

// Basic regex frontmatter parser (no heavy yaml dependency needed)
export function parseFrontmatter(content: string) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match?.[1]) throw new Error('No frontmatter found');

  const nameMatch = match[1].match(/^name:\s*(.+)$/m);
  const descMatch = match[1].match(/^description:\s*(.+)$/m);

  return {
    name: nameMatch
      ? nameMatch[1].replace(/['"]/g, '').trim()
      : 'Unknown Skill',
    description: descMatch
      ? descMatch[1].replace(/['"]/g, '').trim()
      : 'No description provided.',
  };
}

/**
 * Scans the userData/skills directory for valid skill folders containing SKILL.md.
 */
export async function discoverSkills(): Promise<SkillMetadata[]> {
  const skillsDir = await ensureSkillsDirectory();

  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });

    // Filter for directories and resolve their SKILL.md contents in parallel
    const directoryEntries = entries.filter((entry) => entry.isDirectory());

    const skillMetadataResults = await Promise.all(
      directoryEntries.map(async (entry) => {
        const skillDirPath = path.join(skillsDir, entry.name);
        const skillFile = path.join(skillDirPath, 'SKILL.md');

        try {
          const content = await fs.readFile(skillFile, 'utf-8');
          const frontmatter = parseFrontmatter(content);
          return {
            name: frontmatter.name,
            description: frontmatter.description,
            path: skillDirPath,
          };
        } catch (err) {
          // If the file doesn't exist or is invalid, treat as null to filter out
          return null;
        }
      }),
    );

    // Filter out nulls and handle deduplication (first skill with a given name wins)
    const seenNames = new Set<string>();
    return skillMetadataResults.reduce((acc: SkillMetadata[], skill) => {
      if (skill && !seenNames.has(skill.name)) {
        seenNames.add(skill.name);
        acc.push(skill);
      }
      return acc;
    }, []);
  } catch (error) {
    return [];
  }
}
