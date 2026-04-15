import { SkillMetadata } from './skillsDiscovery';

export function buildSkillsPrompt(skills: SkillMetadata[]): string {
  if (skills.length === 0) return '';

  const skillsList = skills
    .map((s) => `- ${s.name}: ${s.description}`)
    .join('\n');

  return `
## Skills

Use the \`loadSkill\` tool to load a skill when the user's request
would benefit from specialized instructions.

Available skills:
${skillsList}
`;
}
