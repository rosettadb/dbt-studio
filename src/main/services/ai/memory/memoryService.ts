import path from 'path';
import { app } from 'electron';
import fs from 'fs-extra';

export const MEMORY_ROOT = path.join(app.getPath('userData'), '.memory');
export const MAX_FILE_LINES = 300;

function resolveSafePath(relativePath: string): string {
  const normalized = path
    .normalize(relativePath)
    .replace(/^(\.\.(\/|\\|$))+/, '');
  const abs = path.resolve(MEMORY_ROOT, normalized);
  if (!abs.startsWith(MEMORY_ROOT)) throw new Error('Path traversal rejected');
  return abs;
}

export async function readMemoryFile(relativePath: string): Promise<string> {
  const abs = resolveSafePath(relativePath);
  return fs.readFile(abs, 'utf8');
}

export async function writeMemoryFile(
  relativePath: string,
  content: string,
  mode: 'append' | 'overwrite' = 'append',
): Promise<void> {
  const abs = resolveSafePath(relativePath);
  await fs.ensureDir(path.dirname(abs));

  if (mode === 'append') {
    let existingLines = 0;
    try {
      const existing = await fs.readFile(abs, 'utf8');
      existingLines = existing.split('\n').length;
    } catch {
      /* file doesn't exist yet */
    }
    const newLines = content.split('\n').length;
    if (existingLines + newLines > MAX_FILE_LINES) {
      throw new Error(
        `File would exceed ${MAX_FILE_LINES} lines (${existingLines} + ${newLines}). ` +
          `Archive or split into child nodes before appending more.`,
      );
    }
    await fs.appendFile(abs, `\n${content}`, 'utf8');
  } else {
    const newLines = content.split('\n').length;
    if (newLines > MAX_FILE_LINES) {
      throw new Error(
        `File exceeds ${MAX_FILE_LINES} lines (${newLines}). ` +
          `Split into child nodes before writing.`,
      );
    }
    await fs.writeFile(abs, content, 'utf8');
  }
}

async function getAllMdFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          await walk(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          files.push(fullPath);
        }
      }),
    );
  }
  await walk(dir);
  return files;
}

export interface SearchResult {
  file: string;
  line: number;
  content: string;
}

export async function searchMemory(query: string): Promise<SearchResult[]> {
  const files = await getAllMdFiles(MEMORY_ROOT);
  const nested = await Promise.all(
    files.map(async (file) => {
      const content = await fs.readFile(file, 'utf8');
      const lines = content.split('\n');
      const fileResults: SearchResult[] = [];
      for (let i = 0; i < lines.length; i += 1) {
        if (lines[i].toLowerCase().includes(query.toLowerCase())) {
          fileResults.push({
            file: path.relative(MEMORY_ROOT, file),
            line: i + 1,
            content: lines[i].trim(),
          });
        }
      }
      return fileResults;
    }),
  );
  return ([] as SearchResult[]).concat(...nested).slice(0, 50);
}

export async function getMemoryStats(): Promise<{
  fileCount: number;
  totalLines: number;
  lastModified: string;
}> {
  const files = await getAllMdFiles(MEMORY_ROOT);
  const stats = await Promise.all(
    files.map(async (f) => {
      const stat = await fs.stat(f);
      const lineCount = (await fs.readFile(f, 'utf8')).split('\n').length;
      return { mtime: stat.mtime.toISOString(), lines: lineCount };
    }),
  );
  const totalLines = stats.reduce((sum, s) => sum + s.lines, 0);
  const lastModified =
    stats.length > 0
      ? stats.reduce(
          (latest, s) => (s.mtime > latest ? s.mtime : latest),
          stats[0].mtime,
        )
      : '';
  return { fileCount: files.length, totalLines, lastModified };
}
