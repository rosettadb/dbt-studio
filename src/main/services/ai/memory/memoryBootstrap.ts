import path from 'path';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { app } from 'electron';
import { MEMORY_ROOT, writeMemoryFile, readMemoryFile } from './memoryService';
import {
  readTreeIndex,
  writeTreeIndex,
  generateInitialTreeIndex,
  generateNodeFrontmatter,
  NODE_IDS,
  NODE_DESCRIPTIONS,
  FRONTMATTER_RE,
  addRootChildToFrontmatter,
} from './memoryIndex';

const RULES_TEMPLATE = `${generateNodeFrontmatter(NODE_IDS.RULES, NODE_IDS.ROOT, [])}# Rules Learned

Rules are prefixed with a domain ID (e.g. BE-01, DL-02, FE-03).
The agent adds rules here as it discovers them.

## Active Rules
`;

const SKILLS_TEMPLATE = `${generateNodeFrontmatter(NODE_IDS.SKILLS, NODE_IDS.ROOT, [])}# Skills Learned

The agent documents repeatable multi-step workflows here.

## Skills
`;

const KNOWLEDGE_TEMPLATE = `${generateNodeFrontmatter(NODE_IDS.KNOWLEDGE, NODE_IDS.ROOT, [])}# Proprietary Knowledge

The agent documents business logic and domain concepts here.

## Concepts
`;

const DBT_PROJECT_TEMPLATE = `${generateNodeFrontmatter(NODE_IDS.DBT_PROJECT, NODE_IDS.ROOT, [])}# DBT Project

Each project gets a numbered child node (e.g. \`04100_my-project.md\`, \`04200_another-project.md\`).
The agent creates and updates these children when project context is scanned.

## Projects
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

async function generateMainContextBody(projectPath?: string): Promise<string> {
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

async function generateMainContext(projectPath?: string): Promise<string> {
  const rootChildren = [
    NODE_IDS.RULES,
    NODE_IDS.SKILLS,
    NODE_IDS.KNOWLEDGE,
    NODE_IDS.DBT_PROJECT,
    NODE_IDS.TOPICS,
  ];
  const frontmatter = generateNodeFrontmatter(
    NODE_IDS.ROOT,
    null,
    rootChildren,
    NODE_DESCRIPTIONS,
  );

  const body = await generateMainContextBody(projectPath);
  return `${frontmatter}${body}`;
}

export async function refreshProjectContext(
  projectPath?: string,
): Promise<void> {
  let frontmatter: string;
  try {
    const existing = await readMemoryFile('00000_maincontext.md');
    const fmMatch = existing.match(FRONTMATTER_RE);
    frontmatter = fmMatch
      ? fmMatch[0]
      : generateNodeFrontmatter(
          NODE_IDS.ROOT,
          null,
          [
            NODE_IDS.RULES,
            NODE_IDS.SKILLS,
            NODE_IDS.KNOWLEDGE,
            NODE_IDS.DBT_PROJECT,
            NODE_IDS.TOPICS,
          ],
          NODE_DESCRIPTIONS,
        );
  } catch {
    frontmatter = generateNodeFrontmatter(
      NODE_IDS.ROOT,
      null,
      [
        NODE_IDS.RULES,
        NODE_IDS.SKILLS,
        NODE_IDS.KNOWLEDGE,
        NODE_IDS.DBT_PROJECT,
        NODE_IDS.TOPICS,
      ],
      NODE_DESCRIPTIONS,
    );
  }

  const body = await generateMainContextBody(projectPath);
  await writeMemoryFile(
    '00000_maincontext.md',
    `${frontmatter}${body}`,
    'overwrite',
  );
}

export async function updateDbtProjectNodes(
  projectPath?: string,
): Promise<void> {
  if (!projectPath) return;

  const projectName = await readDbtProjectName(projectPath);
  const safeId = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const childId = `04100_${safeId}.md`;

  // Update 04000_dbt-project.md frontmatter children + body
  const dbtFrontmatter = generateNodeFrontmatter(
    NODE_IDS.DBT_PROJECT,
    NODE_IDS.ROOT,
    [childId],
  );
  const body = `# DBT Project

_Last updated: ${new Date().toISOString().split('T')[0]}_

## Projects

- **${projectName}** (\`${projectPath}\`)
  - Child node: \`${childId}\`
`;
  await writeMemoryFile(
    '04000_dbt-project.md',
    `${dbtFrontmatter}${body}`,
    'overwrite',
  );

  // Register child in root nodes map
  await addRootChildToFrontmatter(
    childId,
    `Project: ${projectName}`,
    projectPath,
  );

  // Create/update the child node with project-specific scan data
  const projectFrontmatter = generateNodeFrontmatter(
    childId,
    NODE_IDS.DBT_PROJECT,
    [],
  );
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

  const childBody = `# ${projectName}

_Last updated: ${new Date().toISOString().split('T')[0]}_

## Project Scan

- **Models**: ${modelCount} SQL files
- **Macros**: ${macroCount} SQL files
- **Source/config files**: ${sourceCount} YAML files
- **Profile**: ${profile}
- **Path**: \`${projectPath}\`

## Connected Databases
${connections.map((c) => `- ${c.type}: ${c.name}`).join('\n') || '- None configured'}
`;
  await writeMemoryFile(
    childId,
    `${projectFrontmatter}${childBody}`,
    'overwrite',
  );

  // Update tree index so the Memory Tab UI reflects new nodes
  const treeNodes = await readTreeIndex();

  // Ensure 04000_dbt-project.md node exists with child in its children
  const dbtNodeIdx = treeNodes.findIndex((n) => n.id === NODE_IDS.DBT_PROJECT);
  const dbtNode = dbtNodeIdx >= 0 ? treeNodes[dbtNodeIdx] : null;
  if (dbtNode) {
    const hasChild = dbtNode.children?.some((c) => c.path === childId);
    if (!hasChild) {
      const childNode = {
        id: childId,
        path: childId,
        title: `Project: ${projectName}`,
        type: 'file' as const,
        parent: NODE_IDS.DBT_PROJECT,
        lines: 0,
      };
      treeNodes[dbtNodeIdx] = {
        ...dbtNode,
        children: [...(dbtNode.children || []), childNode],
      };
    }
  }

  // Add 04100 entry at root level if not already present (so UI tree shows it)
  const childInRoot = treeNodes.some((n) => n.id === childId);
  if (!childInRoot) {
    treeNodes.push({
      id: childId,
      path: childId,
      title: `Project: ${projectName}`,
      type: 'file',
      parent: NODE_IDS.DBT_PROJECT,
      lines: 0,
    });
  }

  await writeTreeIndex(treeNodes);
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
  await writeMemoryFile(
    '04000_dbt-project.md',
    DBT_PROJECT_TEMPLATE,
    'overwrite',
  );
  await writeTreeIndex(generateInitialTreeIndex());
}
