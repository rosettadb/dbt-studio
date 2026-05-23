import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { app } from 'electron';
import { MEMORY_ROOT, writeMemoryFile } from './memoryService';
import { writeTreeIndex, generateInitialTreeIndex } from './memoryIndex';

const RULES_TEMPLATE = `# Rules Learned

Rules are prefixed with a domain ID (e.g. BE-01, DL-02, FE-03).
The agent adds rules here as it discovers them.

## Active Rules
`;

const SKILLS_TEMPLATE = `# Skills Learned

The agent documents repeatable multi-step workflows here.

## Skills
`;

const KNOWLEDGE_TEMPLATE = `# Proprietary Knowledge

The agent documents business logic and domain concepts here.

## Concepts
`;

async function readDbtProjectName(projectPath: string): Promise<string> {
  try {
    const ymlPath = path.join(projectPath, 'dbt_project.yml');
    const doc = yaml.load(await fs.readFile(ymlPath, 'utf8')) as any;
    return doc?.name || 'Unknown Project';
  } catch {
    return 'Unknown Project';
  }
}

async function readDbtProfile(projectPath: string): Promise<string> {
  try {
    const ymlPath = path.join(projectPath, 'dbt_project.yml');
    const doc = yaml.load(await fs.readFile(ymlPath, 'utf8')) as any;
    return doc?.profile || 'default';
  } catch {
    return 'default';
  }
}

async function countFilesRecursive(
  dirPath: string,
  ext: string,
): Promise<number> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const counts = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          return countFilesRecursive(fullPath, ext);
        }
        if (entry.isFile() && entry.name.endsWith(ext)) {
          return 1;
        }
        return 0;
      }),
    );
    return counts.reduce((sum, c) => sum + c, 0);
  } catch {
    return 0;
  }
}

async function readConnectors(): Promise<
  Array<{ type: string; name: string }>
> {
  const connectorsPath = path.join(app.getPath('userData'), 'connectors.json');
  try {
    const raw = await fs.readFile(connectorsPath, 'utf8');
    const data = JSON.parse(raw);
    if (Array.isArray(data)) {
      return data.map((c: any) => ({
        type: c.type || 'unknown',
        name: c.name || 'Unnamed',
      }));
    }
    return [];
  } catch {
    return [];
  }
}

async function generateMainContext(projectPath?: string): Promise<string> {
  if (!projectPath) {
    return `# DBT Studio Project

_Last updated: ${new Date().toISOString().split('T')[0]}_

## Project Overview
- No project loaded yet. The agent will update this when a project is opened.

## User Preferences
- None recorded yet. The agent will discover them over time.
`;
  }

  const projectName = await readDbtProjectName(projectPath);
  const modelCount = await countFilesRecursive(
    path.join(projectPath, 'models'),
    '.sql',
  );
  const macroCount = await countFilesRecursive(
    path.join(projectPath, 'macros'),
    '.sql',
  );
  const sourceCount = await countFilesRecursive(
    path.join(projectPath, 'models'),
    '.yml',
  );
  const connections = await readConnectors();
  const profile = await readDbtProfile(projectPath);

  return `# DBT Studio Project — ${projectName}

_Last updated: ${new Date().toISOString().split('T')[0]}_

## Project Overview
- **Project**: ${projectName}
- **Models**: ${modelCount} SQL files
- **Macros**: ${macroCount} SQL files
- **Source/config files**: ${sourceCount} YAML files
- **Profile**: ${profile}

## Connected Databases
${connections.map((c) => `- ${c.type}: ${c.name}`).join('\n') || '- None configured'}

## User Preferences
- None recorded yet. The agent will discover them over time.

## Key Files
- \`dbt_project.yml\` — dbt configuration
- \`profiles.yml\` — database profiles (read-only)
`;
}

export async function bootstrapMemory(projectPath?: string): Promise<void> {
  if (await fs.pathExists(MEMORY_ROOT)) return;

  await fs.ensureDir(path.join(MEMORY_ROOT, 'topics'));
  await fs.ensureDir(path.join(MEMORY_ROOT, 'tree'));

  await writeMemoryFile(
    '00000_maincontext.md',
    await generateMainContext(projectPath),
    'overwrite',
  );
  await writeMemoryFile('01000_rules-learned.md', RULES_TEMPLATE, 'overwrite');
  await writeMemoryFile(
    '02000_skills-learned.md',
    SKILLS_TEMPLATE,
    'overwrite',
  );
  await writeMemoryFile(
    '03000_proprietary-knowledge.md',
    KNOWLEDGE_TEMPLATE,
    'overwrite',
  );
  await writeTreeIndex(generateInitialTreeIndex());
}
