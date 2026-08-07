import { promises as nodeFs } from 'fs';
import os from 'os';
import path from 'path';
import fs from 'fs-extra';
import { readProjectAgentContext } from '../../../../../src/main/services/ai/projectAgentContext';

describe('readProjectAgentContext', () => {
  let temporaryDirectory: string;

  beforeEach(async () => {
    temporaryDirectory = await nodeFs.mkdtemp(
      path.join(os.tmpdir(), 'dbt-studio-project-context-'),
    );
  });

  afterEach(async () => {
    await fs.remove(temporaryDirectory);
  });

  it('reads only the bounded canonical project-root AGENTS.md', async () => {
    await fs.writeFile(
      path.join(temporaryDirectory, 'AGENTS.md'),
      '# Project instructions\n',
    );
    await fs.writeFile(
      path.join(temporaryDirectory, 'agent.md'),
      '# Legacy instructions\n',
    );

    await expect(readProjectAgentContext(temporaryDirectory)).resolves.toBe(
      '# Project instructions\n',
    );

    await fs.remove(path.join(temporaryDirectory, 'AGENTS.md'));
    await expect(
      readProjectAgentContext(temporaryDirectory),
    ).resolves.toBeUndefined();
  });

  it('rejects oversized and symlinked project context files', async () => {
    const contextPath = path.join(temporaryDirectory, 'AGENTS.md');
    await fs.writeFile(contextPath, 'x'.repeat(32 * 1024 + 1));
    await expect(
      readProjectAgentContext(temporaryDirectory),
    ).resolves.toBeUndefined();

    await fs.remove(contextPath);
    const outsidePath = path.join(
      path.dirname(temporaryDirectory),
      `${path.basename(temporaryDirectory)}-outside.md`,
    );
    await fs.writeFile(outsidePath, '# Outside\n');
    await fs.symlink(outsidePath, contextPath);
    await expect(
      readProjectAgentContext(temporaryDirectory),
    ).resolves.toBeUndefined();
    await fs.remove(outsidePath);
  });
});
