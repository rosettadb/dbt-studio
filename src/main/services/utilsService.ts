import fs from 'fs/promises';
import path from 'path';
import { FileNodeWithContent } from '../../types/backend';

export default class UtilsService {
  /**
   * Reads a list of files and returns their names + contents
   * @param files - Array of file paths
   */
  public static async getFilesWithContent(
    files: string[],
  ): Promise<FileNodeWithContent[]> {
    const results: FileNodeWithContent[] = [];

    // eslint-disable-next-line no-restricted-syntax
    for (const filePath of files) {
      const { base: name } = path.parse(filePath);
      try {
        // eslint-disable-next-line no-await-in-loop
        const content = await fs.readFile(filePath, 'utf-8');
        results.push({
          name,
          content,
          type: 'file',
          path: filePath,
        });
      } catch (err: any) {
        results.push({
          name,
          type: 'file',
          path: filePath,
          content: `Error reading file: ${err.message}`,
        });
      }
    }

    return results;
  }
}
