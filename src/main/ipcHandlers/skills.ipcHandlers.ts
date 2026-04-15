import { ipcMain } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  discoverSkills,
  parseFrontmatter,
} from '../services/ai/skills/skillsDiscovery';
import { ensureSkillsDirectory } from '../services/ai/skills/skillsStorage';

export function registerSkillsHandlers() {
  // Return the list of skills to populate the UI (names and descriptions)
  ipcMain.handle('skills:list', async () => {
    return discoverSkills();
  });

  // Let the frontend know where the directory is (e.g. for "Open in Finder" buttons)
  ipcMain.handle('skills:get-directory', async () => {
    return ensureSkillsDirectory();
  });

  // Create a new skill
  ipcMain.handle(
    'skills:create',
    async (
      event,
      {
        name,
        description,
        instructions,
      }: { name: string; description: string; instructions: string },
    ) => {
      const skillsDir = await ensureSkillsDirectory();

      // Sanitize folder name
      const folderName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const skillPath = path.join(skillsDir, folderName);

      // check if it already exists
      try {
        await fs.access(skillPath);
        throw new Error(
          `A skill with folder name ${folderName} already exists.`,
        );
      } catch (err: any) {
        if (err.code !== 'ENOENT') throw err;
      }

      await fs.mkdir(skillPath, { recursive: true });

      const content = `---
name: ${name}
description: ${description}
---

${instructions}
`;
      await fs.writeFile(path.join(skillPath, 'SKILL.md'), content, 'utf-8');
      return true;
    },
  );

  // Import a skill from URL
  ipcMain.handle('skills:import', async (event, url: string) => {
    let fetchUrl = url;
    let skillFiles: { path: string; url: string }[] = [];

    // Auto-resolve skills.sh or GitHub URLs into raw SKILL.md URLs
    const skillsShMatch = url.match(
      /^https?:\/\/skills\.sh\/([^/]+)\/([^/]+)\/([^/]+)/,
    );
    const githubMatch = url.match(
      /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/,
    );

    if (skillsShMatch || githubMatch) {
      let owner: string;
      let repo: string;
      let branch: string;
      let skillPathInRepo: string;

      if (skillsShMatch) {
        [, owner, repo, skillPathInRepo] = skillsShMatch;
        branch = 'HEAD';
      } else {
        [, owner, repo, branch, skillPathInRepo] = githubMatch!;
      }

      // Hit GitHub's tree API to locate the files
      const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
        {
          headers: { 'User-Agent': 'dbt-studio-agent' },
        },
      );

      if (!treeRes.ok) {
        throw new Error(
          `Failed to locate repository ${owner}/${repo} on GitHub`,
        );
      }

      const treeData = await treeRes.json();

      // Find the SKILL.md file within the target path
      // We look for a file that ends with /SKILL.md and contains the skillPathInRepo
      const skillFileNode = treeData.tree.find(
        (node: any) =>
          node.type === 'blob' &&
          node.path.includes(skillPathInRepo) &&
          node.path.endsWith('/SKILL.md'),
      );

      if (!skillFileNode) {
        throw new Error(
          `Could not find SKILL.md at ${skillPathInRepo} in the ${owner}/${repo} repository`,
        );
      }

      const skillRepoRoot = path.dirname(skillFileNode.path);

      // Collect all files in the skill's directory and its subdirectories
      skillFiles = treeData.tree
        .filter(
          (node: any) =>
            node.type === 'blob' && node.path.startsWith(skillRepoRoot),
        )
        .map((node: any) => ({
          path: path.relative(skillRepoRoot, node.path),
          url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${node.path}`,
        }));

      // The main SKILL.md url for frontmatter parsing
      fetchUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${skillFileNode.path}`;
    }

    // Basic fetch for the main SKILL.md to parse frontmatter/metadata
    const response = await fetch(fetchUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch skill metadata: ${response.statusText}`);
    }
    const mainContent = await response.text();

    // Parse frontmatter
    let frontmatter;
    try {
      frontmatter = parseFrontmatter(mainContent);
    } catch (err: any) {
      throw new Error(
        `Invalid skill format: Could not parse frontmatter from the provided URL.`,
      );
    }

    const { name } = frontmatter;
    const skillsDir = await ensureSkillsDirectory();

    // Sanitize folder name for the local filesystem
    const folderName = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    const skillPath = path.join(skillsDir, folderName);

    // Check if it already exists
    try {
      await fs.access(skillPath);
      // If it exists, we'll overwrite it for "update" behavior or just throw?
      // User requested test so let's allow overwrite for now by removing it first?
      // Actually, standard is to throw error if already exists.
      throw new Error(`A skill with name "${name}" is already installed.`);
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }

    // Ensure the main folder exists
    await fs.mkdir(skillPath, { recursive: true });

    if (skillFiles.length > 0) {
      // Full Directory Import
      await Promise.all(
        skillFiles.map(async (file) => {
          const targetPath = path.join(skillPath, file.path);
          await fs.mkdir(path.dirname(targetPath), { recursive: true });

          const fileRes = await fetch(file.url);
          if (fileRes.ok) {
            const content = await fileRes.text();
            await fs.writeFile(targetPath, content, 'utf-8');
          }
        }),
      );
    } else {
      // Single File Import
      await fs.writeFile(
        path.join(skillPath, 'SKILL.md'),
        mainContent,
        'utf-8',
      );
    }

    return true;
  });

  // Optional: A handler to completely remove a skill directory
  ipcMain.handle('skills:delete', async (event, folderPath: string) => {
    const skillsDir = await ensureSkillsDirectory();

    // Security check: Make sure path remains inside the skills directory
    const resolvedPath = path.resolve(folderPath);
    if (!resolvedPath.startsWith(path.resolve(skillsDir))) {
      throw new Error('Access denied: Cannot delete outside skills directory');
    }

    await fs.rm(resolvedPath, { recursive: true, force: true });
    return true;
  });
}
