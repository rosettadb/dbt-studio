import path from 'path';
import fs from 'fs-extra';
import SecureStorageService from '../services/secureStorage.service';

export interface DbtChartsEnv {
  env: Record<string, string | undefined>;
  // Every value read from keytar, for redacting process output.
  secrets: string[];
}

const ENV_VAR_PATTERN = /env_var\(\s*["']([^"']+)["']/g;

/**
 * The environment `dct` runs with: the same secrets dbt gets (every
 * `env_var("…")` name in the project-root profiles.yml, filled from keytar,
 * the rule `buildDbtProcessEnv` in ai/tools/dbt.tools.ts follows) plus the
 * dct switches. The env goes to the child process only; never return it over
 * IPC.
 */
export const buildDbtChartsEnv = async (
  projectPath: string,
): Promise<DbtChartsEnv> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    DBT_PROFILES_DIR: projectPath,
    DO_NOT_TRACK: '1',
    DCT_NO_AUTO_INSTALL: '1',
    PYTHONUNBUFFERED: '1',
    PYTHONIOENCODING: 'utf-8',
  };
  const secrets: string[] = [];
  const profilesPath = path.join(projectPath, 'profiles.yml');
  if (!(await fs.pathExists(profilesPath))) return { env, secrets };

  const content = await fs.readFile(profilesPath, 'utf8');
  const names = new Set<string>(
    Array.from(content.matchAll(ENV_VAR_PATTERN), (match) => match[1]),
  );

  await Promise.all(
    Array.from(names).map(async (name) => {
      const existing = env[name];
      if (existing) {
        secrets.push(existing);
        return;
      }
      const stored = await SecureStorageService.getCredential(name);
      if (stored) {
        env[name] = stored;
        secrets.push(stored);
      }
    }),
  );
  return { env, secrets };
};

/** Replaces every secret value (longest first) with `***`. */
export const createRedactor = (secrets: string[]) => {
  const values = Array.from(new Set(secrets))
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
  return (text: string): string =>
    values.reduce((out, value) => out.split(value).join('***'), text);
};
