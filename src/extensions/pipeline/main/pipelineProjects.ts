/* eslint-disable no-restricted-syntax, no-await-in-loop */
import path from 'path';
import fs from 'fs';
import { ProjectsService } from '../../../extensionApi/studioMain/services';
import {
  extractPipelineRequiredEnvVars,
  RequiredEnvVarSource,
} from './pipelineEnvVars';

// The pipelines of a project and what a local run of one needs.

/**
 * Extract every env var a local run of a pipeline is likely to need:
 * profiles.yml env_var() references plus, when a pipeline is given,
 * TF_VAR_* names for any terraform@v1 step's declared variables and
 * shell-style var references found in any step's command.
 */
export async function extractRequiredEnvVars(
  projectId: string,
  pipelineRelativePath?: string,
): Promise<
  { name: string; value?: string; sources: RequiredEnvVarSource[] }[]
> {
  const project = await ProjectsService.getProject(projectId);
  if (!project) throw new Error('Project not found');

  const profileVars = await ProjectsService.extractProfileEnvVars(projectId);
  const combined = new Map<
    string,
    { name: string; value?: string; sources: RequiredEnvVarSource[] }
  >();
  profileVars.forEach((v) => {
    combined.set(v.name, { ...v, sources: ['profile'] });
  });

  if (pipelineRelativePath) {
    // pipelineRelativePath is relative to the pipeline root (rosetta/pipelines/,
    // with .rosetta/ as the deprecated fallback), not the project root - it's
    // produced by getPipelineRelativeName / listPipelines, neither of which
    // include that root prefix.
    const canonicalPath = path.join(
      project.path,
      'rosetta',
      'pipelines',
      pipelineRelativePath,
    );
    const legacyPath = path.join(
      project.path,
      '.rosetta',
      pipelineRelativePath,
    );
    const pipelineAbsolutePath = fs.existsSync(canonicalPath)
      ? canonicalPath
      : legacyPath;
    const pipelineVars = await extractPipelineRequiredEnvVars(
      project.path,
      pipelineAbsolutePath,
    );
    pipelineVars.forEach((v) => {
      const existing = combined.get(v.name);
      if (existing) {
        existing.sources = Array.from(
          new Set([...existing.sources, ...v.sources]),
        );
      } else {
        combined.set(v.name, { name: v.name, sources: v.sources });
      }
    });
  }

  return Array.from(combined.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Recursively lists pipeline YAML files under a directory, ignoring
 * non-pipeline yaml files such as main.conf. `name` is the path relative to
 * `baseDir` (POSIX-style, extension stripped) so pipelines nested in
 * subdirectories keep their directory prefix, e.g. `test/test` for
 * `<baseDir>/test/test.yml`.
 */
async function listPipelineFilesInDir(
  dir: string,
  baseDir: string = dir,
): Promise<{ name: string; path: string }[]> {
  if (!fs.existsSync(dir)) return [];

  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const results: { name: string; path: string }[] = [];

  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listPipelineFilesInDir(entryPath, baseDir);
      results.push(...nested);
    } else if (
      (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) &&
      entry.name !== 'main.conf'
    ) {
      const relative = path
        .relative(baseDir, entryPath)
        .replace(/\\/g, '/')
        .replace(/\.(yml|yaml)$/, '');
      results.push({ name: relative, path: entryPath });
    }
  }

  return results;
}

/**
 * List pipeline YAML files under rosetta/pipelines/ (current location) and
 * .rosetta/ (deprecated location, kept during the transition to
 * rosetta/pipelines/ — remove once existing projects have migrated).
 */
export async function listPipelines(
  projectId: string,
): Promise<{ name: string; path: string }[]> {
  const project = await ProjectsService.getProject(projectId);
  if (!project) throw new Error('Project not found');

  const pipelinesDir = path.join(project.path, 'rosetta', 'pipelines');
  const legacyPipelinesDir = path.join(project.path, '.rosetta');

  const [current, legacy] = await Promise.all([
    listPipelineFilesInDir(pipelinesDir),
    listPipelineFilesInDir(legacyPipelinesDir),
  ]);

  const currentNames = new Set(current.map((p) => p.name));
  return [...current, ...legacy.filter((p) => !currentNames.has(p.name))];
}
