import fs from 'fs-extra';
import path from 'path';
import { PROJECT_AGENT_CONTEXT_FILE } from '../../../shared/agentMemoryConstants';

const PROJECT_AGENT_CONTEXT_MAX_BYTES = 32 * 1024;

export const readProjectAgentContext = async (
  projectPath: string | undefined,
): Promise<string | undefined> => {
  if (!projectPath) return undefined;
  const rootPath = path.resolve(projectPath);
  const contextPath = path.join(rootPath, PROJECT_AGENT_CONTEXT_FILE);
  try {
    const stat = await fs.lstat(contextPath);
    if (!stat.isFile() || stat.isSymbolicLink()) return undefined;
    if (stat.size > PROJECT_AGENT_CONTEXT_MAX_BYTES) return undefined;
    const [realRoot, realContextPath] = await Promise.all([
      fs.realpath(rootPath),
      fs.realpath(contextPath),
    ]);
    const relative = path.relative(realRoot, realContextPath);
    if (relative !== PROJECT_AGENT_CONTEXT_FILE || path.isAbsolute(relative)) {
      return undefined;
    }
    return fs.readFile(realContextPath, 'utf8');
  } catch (error) {
    if ((error as { code?: string }).code === 'ENOENT') return undefined;
    throw error;
  }
};
