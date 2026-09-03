import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

interface PipelineStepLike {
  plugin?: string;
  command?: string;
  working_dir?: string;
}

interface PipelineJobLike {
  steps?: PipelineStepLike[];
}

interface PipelineConfigLike {
  jobs?: PipelineJobLike[];
}

const SHELL_VAR_DENYLIST = new Set(['PATH', 'HOME', 'PWD', 'SHELL', 'USER']);

/**
 * Reads every *.tf file directly under tfDir (non-recursive, matching how
 * working_dir is used elsewhere in this codebase) and collects declared
 * `variable "name" { ... }` names.
 */
export async function extractTerraformVariableNames(
  tfDir: string,
): Promise<string[]> {
  if (!fs.existsSync(tfDir)) return [];
  let entries: string[];
  try {
    entries = await fs.promises.readdir(tfDir);
  } catch {
    return [];
  }

  const names = new Set<string>();
  await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.tf'))
      .map(async (entry) => {
        try {
          const content = await fs.promises.readFile(
            path.join(tfDir, entry),
            'utf8',
          );
          const pattern = /variable\s+"([^"]+)"\s*\{/g;
          let match = pattern.exec(content);
          while (match) {
            names.add(match[1]);
            match = pattern.exec(content);
          }
        } catch {
          // Skip files that can't be read.
        }
      }),
  );
  return Array.from(names);
}

/**
 * Extracts likely shell env-var references (e.g. $VAR, ${VAR}) from a step's
 * command string. Restricted to the uppercase-leading convention used
 * throughout this codebase (TF_VAR_*, DBT_*) to avoid false positives from
 * positional params ($1, $@), subshells ($(...)), or host-provided vars.
 */
export function extractShellVarReferences(command: string): string[] {
  const names = new Set<string>();
  const pattern = /\$\{?([A-Z_][A-Z0-9_]*)\}?/g;
  let match = pattern.exec(command);
  while (match) {
    const name = match[1];
    if (!SHELL_VAR_DENYLIST.has(name)) {
      names.add(name);
    }
    match = pattern.exec(command);
  }
  return Array.from(names);
}

export type RequiredEnvVarSource = 'profile' | 'terraform' | 'command';

export interface RequiredEnvVar {
  name: string;
  sources: RequiredEnvVarSource[];
}

/**
 * Walks a pipeline.yml's jobs/steps and reports env vars a local run would
 * need: TF_VAR_<name> for every declared variable in a terraform@v1 step's
 * working_dir, plus any shell-style var reference found in a step's command.
 */
export async function extractPipelineRequiredEnvVars(
  projectPath: string,
  pipelineAbsolutePath: string,
): Promise<RequiredEnvVar[]> {
  if (!fs.existsSync(pipelineAbsolutePath)) return [];

  let parsed: unknown;
  try {
    const content = await fs.promises.readFile(pipelineAbsolutePath, 'utf8');
    parsed = yaml.load(content);
  } catch {
    return [];
  }

  const config = parsed as PipelineConfigLike | null;
  const jobs = Array.isArray(config?.jobs) ? (config?.jobs ?? []) : [];
  const steps = jobs.flatMap((job) =>
    Array.isArray(job?.steps) ? (job?.steps ?? []) : [],
  );

  const found = new Map<string, Set<RequiredEnvVarSource>>();
  const addName = (name: string, source: RequiredEnvVarSource) => {
    const sources = found.get(name) ?? new Set<RequiredEnvVarSource>();
    sources.add(source);
    found.set(name, sources);
  };

  await Promise.all(
    steps.map(async (step) => {
      if (step?.plugin === 'terraform@v1') {
        const tfDir = path.resolve(projectPath, step.working_dir || '.');
        const varNames = await extractTerraformVariableNames(tfDir);
        varNames.forEach((name) => addName(`TF_VAR_${name}`, 'terraform'));
      }
      if (typeof step?.command === 'string') {
        extractShellVarReferences(step.command).forEach((name) =>
          addName(name, 'command'),
        );
      }
    }),
  );

  return Array.from(found.entries())
    .map(([name, sources]) => ({ name, sources: Array.from(sources) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
