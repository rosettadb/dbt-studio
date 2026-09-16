import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { ProjectsService } from '../services';

const PIPELINE_TEMPLATES_MANIFEST_URL =
  'https://raw.githubusercontent.com/rosettadb/dbt-studio-templates/main/pipelines.json';
const PROJECT_TEMPLATES_MANIFEST_URL =
  'https://raw.githubusercontent.com/rosettadb/dbt-studio-templates/main/projects.json';

const RAW_GITHUB_URL_PATTERN = /^https:\/\/raw\.githubusercontent\.com\//;
const GITHUB_ARCHIVE_URL_PATTERN =
  /^https:\/\/(github\.com|codeload\.github\.com)\//;

const lstatOrNull = async (p: string) => {
  try {
    return await fs.promises.lstat(p);
  } catch {
    return null;
  }
};

// The lexical startsWith check on the target cannot see symlinks that already
// exist inside the project. Walk up to the deepest existing path component
// without following links, reject it if it is a symlink (including dangling
// ones, which writeFile would otherwise create through), and confirm its real
// location is still inside the real project root.
const assertNoSymlinkEscape = async (
  realRoot: string,
  target: string,
  entryName: string,
) => {
  let existing = target;
  let stat = await lstatOrNull(existing);
  while (!stat) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
    // eslint-disable-next-line no-await-in-loop
    stat = await lstatOrNull(existing);
  }
  if (!stat || stat.isSymbolicLink()) {
    throw new Error(
      `Refusing to extract through a symlink in the project: ${entryName}`,
    );
  }
  const real = await fs.promises.realpath(existing);
  if (real !== realRoot && !real.startsWith(realRoot + path.sep)) {
    throw new Error(`Refusing to extract outside the project: ${entryName}`);
  }
};

export function registerPipelineTemplatesHandlers() {
  // Fetch the public pipeline and project templates manifests
  ipcMain.handle('pipeline-templates:list', async () => {
    const res = await fetch(PIPELINE_TEMPLATES_MANIFEST_URL);
    if (!res.ok) {
      throw new Error(`Failed to fetch pipeline templates: ${res.statusText}`);
    }
    const pipelineTemplates = await res.json();

    // Project templates are optional — pipeline templates still show if this fails
    let projectTemplates: unknown[] = [];
    try {
      const projectsRes = await fetch(PROJECT_TEMPLATES_MANIFEST_URL);
      if (projectsRes.ok) {
        const parsed = await projectsRes.json();
        if (Array.isArray(parsed)) {
          projectTemplates = parsed;
        }
      }
    } catch {
      projectTemplates = [];
    }

    return [...pipelineTemplates, ...projectTemplates];
  });

  // Fetch the raw YAML content for a specific template
  ipcMain.handle(
    'pipeline-templates:fetch-content',
    async (event, url: string) => {
      if (!RAW_GITHUB_URL_PATTERN.test(url)) {
        throw new Error(
          'Refusing to fetch template content from an untrusted host',
        );
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch template content: ${res.statusText}`);
      }
      return res.text();
    },
  );

  // Download a zip template and extract it into the project root.
  // 'check' writes nothing and returns the paths that already exist.
  // The project root is resolved from the main-process registry so the
  // renderer cannot direct extraction to an arbitrary directory.
  ipcMain.handle(
    'pipeline-templates:apply-zip',
    async (
      event,
      projectId: string,
      url: string,
      mode: 'check' | 'replace' | 'skip',
    ) => {
      const projects = await ProjectsService.loadProjects();
      const project = projects.find((p) => p.id === projectId);
      if (!project) {
        throw new Error(`Project not found: ${projectId}`);
      }

      const isGithubArchive = GITHUB_ARCHIVE_URL_PATTERN.test(url);
      if (!isGithubArchive && !RAW_GITHUB_URL_PATTERN.test(url)) {
        throw new Error(
          'Refusing to fetch template content from an untrusted host',
        );
      }
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch template content: ${res.statusText}`);
      }
      const zip = new AdmZip(Buffer.from(await res.arrayBuffer()));

      // GitHub repo archives wrap everything in a single top-level folder
      let stripPrefix = '';
      if (isGithubArchive) {
        const topLevel = new Set(
          zip.getEntries().map((entry) => entry.entryName.split('/')[0]),
        );
        if (topLevel.size === 1) {
          stripPrefix = `${[...topLevel][0]}/`;
        }
      }

      const root = path.resolve(project.path);
      const files = zip
        .getEntries()
        .filter((entry) => !entry.isDirectory)
        .map((entry) => {
          const relativePath = entry.entryName.slice(stripPrefix.length);
          const target = path.resolve(root, relativePath);
          if (!target.startsWith(root + path.sep)) {
            throw new Error(
              `Refusing to extract outside the project: ${entry.entryName}`,
            );
          }
          return { entry, relativePath, target };
        });

      if (mode === 'check') {
        return files
          .filter((file) => fs.existsSync(file.target))
          .map((file) => file.relativePath);
      }

      const realRoot = await fs.promises.realpath(root);

      // eslint-disable-next-line no-restricted-syntax
      for (const file of files) {
        if (mode === 'skip' && fs.existsSync(file.target)) {
          // eslint-disable-next-line no-continue
          continue;
        }
        // eslint-disable-next-line no-await-in-loop
        await assertNoSymlinkEscape(
          realRoot,
          file.target,
          file.entry.entryName,
        );
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.mkdir(path.dirname(file.target), { recursive: true });
        // eslint-disable-next-line no-await-in-loop
        await fs.promises.writeFile(file.target, file.entry.getData());
      }
      return [];
    },
  );
}
