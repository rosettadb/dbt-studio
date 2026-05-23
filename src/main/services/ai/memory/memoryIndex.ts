import path from 'path';
import fs from 'fs-extra';
import { MEMORY_ROOT, writeMemoryFile } from './memoryService';

const INDEX_PATH = 'tree/index.json';

export interface TreeNode {
  path: string;
  title: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
  updated?: string;
  lines?: number;
}

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
      path: '00000_maincontext.md',
      title: 'Main Context',
      type: 'file',
      lines: 0,
    },
    {
      path: '01000_rules-learned.md',
      title: 'Rules Learned',
      type: 'file',
      lines: 0,
    },
    {
      path: '02000_skills-learned.md',
      title: 'Skills Learned',
      type: 'file',
      lines: 0,
    },
    {
      path: '03000_proprietary-knowledge.md',
      title: 'Proprietary Knowledge',
      type: 'file',
      lines: 0,
    },
    { path: 'topics', title: 'Topics', type: 'folder', children: [] },
  ];
}
