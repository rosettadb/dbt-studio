import { projectsServices } from '../../services';
import { path as nodePath } from '../../lib/path';
import {
  PROJECT_QUERIES_DIR,
  queryFileStem,
} from '../../../shared/projectFolders';

/**
 * Save a query as `<project>/queries/<name>.sql` (plan 95d), adding `_2`,
 * `_3`... when the name is taken. Returns the new file's path.
 */
export async function saveQueryToProject(
  projectPath: string,
  name: string,
  query: string,
): Promise<string> {
  const folder = nodePath.join(projectPath, PROJECT_QUERIES_DIR);
  const stem = queryFileStem(name);
  for (let attempt = 1; attempt <= 100; attempt += 1) {
    const fileName = attempt === 1 ? `${stem}.sql` : `${stem}_${attempt}.sql`;
    // createFile makes the folder and returns nothing if the file exists
    // eslint-disable-next-line no-await-in-loop
    const created = await projectsServices.createFile({
      filePath: folder,
      name: fileName,
      content: query.endsWith('\n') ? query : `${query}\n`,
    });
    if (created) return created;
  }
  throw new Error(
    `Too many queries named "${stem}" in ${PROJECT_QUERIES_DIR}/`,
  );
}
