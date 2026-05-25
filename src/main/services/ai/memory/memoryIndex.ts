import path from 'path';
import fs from 'fs-extra';
import { MEMORY_ROOT, writeMemoryFile } from './memoryService';

const INDEX_PATH = 'tree/index.json';

export interface TreeNode {
  id: string;
  path: string;
  title: string;
  type: 'file' | 'folder';
  parent: string | null;
  children?: TreeNode[];
  updated?: string;
  lines?: number;
}

export const NODE_IDS = {
  ROOT: '00000_maincontext.md',
  RULES: '01000_rules-learned.md',
  SKILLS: '02000_skills-learned.md',
  KNOWLEDGE: '03000_proprietary-knowledge.md',
  DBT_PROJECT: '04000_dbt-project.md',
  TOPICS: 'topics',
} as const;

export const NODE_DESCRIPTIONS: Record<
  string,
  { title: string; description: string }
> = {
  [NODE_IDS.RULES]: {
    title: 'Rules Learned',
    description: 'Hard constraints, anti-patterns, things to avoid',
  },
  [NODE_IDS.SKILLS]: {
    title: 'Skills Learned',
    description: 'Multi-step workflows and repeatable processes',
  },
  [NODE_IDS.KNOWLEDGE]: {
    title: 'Proprietary Knowledge',
    description: 'Business logic, domain concepts, terminology',
  },
  [NODE_IDS.DBT_PROJECT]: {
    title: 'DBT Project',
    description: 'Project-specific context, one child per project',
  },
  [NODE_IDS.TOPICS]: {
    title: 'Topics',
    description: 'Deep-dive files on specific subjects',
  },
};

export async function readTreeIndex(): Promise<TreeNode[]> {
  try {
    const raw = await fs.readFile(path.join(MEMORY_ROOT, INDEX_PATH), 'utf8');
    return JSON.parse(raw).nodes || [];
  } catch {
    return [];
  }
}

export async function writeTreeIndex(nodes: TreeNode[]): Promise<void> {
  await writeMemoryFile(
    INDEX_PATH,
    JSON.stringify({ nodes, updatedAt: new Date().toISOString() }, null, 2),
    'overwrite',
  );
}

export function generateInitialTreeIndex(): TreeNode[] {
  return [
    {
      id: NODE_IDS.ROOT,
      path: '00000_maincontext.md',
      title: 'Main Context',
      type: 'file',
      parent: null,
      lines: 0,
    },
    {
      id: NODE_IDS.RULES,
      path: '01000_rules-learned.md',
      title: 'Rules Learned',
      type: 'file',
      parent: NODE_IDS.ROOT,
      lines: 0,
    },
    {
      id: NODE_IDS.SKILLS,
      path: '02000_skills-learned.md',
      title: 'Skills Learned',
      type: 'file',
      parent: NODE_IDS.ROOT,
      lines: 0,
    },
    {
      id: NODE_IDS.KNOWLEDGE,
      path: '03000_proprietary-knowledge.md',
      title: 'Proprietary Knowledge',
      type: 'file',
      parent: NODE_IDS.ROOT,
      lines: 0,
    },
    {
      id: NODE_IDS.DBT_PROJECT,
      path: '04000_dbt-project.md',
      title: 'DBT Project',
      type: 'file',
      parent: NODE_IDS.ROOT,
      lines: 0,
    },
    {
      id: NODE_IDS.TOPICS,
      path: 'topics',
      title: 'Topics',
      type: 'folder',
      parent: NODE_IDS.ROOT,
      children: [],
    },
  ];
}

export function generateNodeFrontmatter(
  id: string,
  parent: string | null,
  children: string[],
  nodes?: Record<string, { title: string; description: string }>,
): string {
  const childrenYaml =
    children.length === 0
      ? ' []'
      : `\n${children.map((c) => `  - '${c}'`).join('\n')}`;

  const nodesYaml = nodes
    ? `\n${Object.entries(nodes)
        .map(
          ([nodeId, meta]) =>
            `  '${nodeId}':\n    title: '${meta.title}'\n    description: '${meta.description}'`,
        )
        .join('\n')}`
    : '';

  return `---
id: '${id}'
parent: ${parent ? `'${parent}'` : 'null'}
children:${childrenYaml}${nodesYaml}
---
`;
}

export const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n/;

const SCAN_STATE_PATH = 'tree/scan-state.json';

export interface ScanState {
  lastHistoryScan: string | null;
}

export async function readScanState(): Promise<ScanState> {
  try {
    const raw = await fs.readFile(
      path.join(MEMORY_ROOT, SCAN_STATE_PATH),
      'utf8',
    );
    return JSON.parse(raw) as ScanState;
  } catch {
    return { lastHistoryScan: null };
  }
}

export async function writeScanState(state: ScanState): Promise<void> {
  await fs.writeFile(
    path.join(MEMORY_ROOT, SCAN_STATE_PATH),
    JSON.stringify(state, null, 2),
    'utf8',
  );
}

export async function addRootChildToFrontmatter(
  childPath: string,
  title: string,
  description: string,
): Promise<void> {
  const rootContent = await fs.readFile(
    path.join(MEMORY_ROOT, NODE_IDS.ROOT),
    'utf8',
  );
  const fmMatch = rootContent.match(FRONTMATTER_RE);
  if (!fmMatch) return;

  let fm = fmMatch[1];
  const childLine = `  - '${childPath}'`;

  if (!fm.includes(childLine)) {
    if (fm.includes('\nnodes:\n')) {
      fm = fm.replace('\nnodes:\n', `\n${childLine}\nnodes:\n`);
    } else {
      fm = fm.replace(/\n(?=---\s*$)/, `\n${childLine}\n`);
    }
  }

  const nodeKey = `  '${childPath}':`;
  if (!fm.includes(nodeKey)) {
    const nodeEntry = `  '${childPath}':\n    title: '${title}'\n    description: '${description}'`;
    fm = fm.replace(/\n(?=---\s*$)/, `\n${nodeEntry}\n`);
  }

  const newContent = rootContent.replace(FRONTMATTER_RE, `---\n${fm}\n---\n`);
  await fs.writeFile(path.join(MEMORY_ROOT, NODE_IDS.ROOT), newContent, 'utf8');
}
