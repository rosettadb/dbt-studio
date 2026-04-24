import { app } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Returns the absolute path to the skills directory inside Electron's userData
 */
export const getSkillsDirectory = (): string => {
  return path.join(app.getPath('userData'), 'skills');
};

/**
 * Ensures the skills directory exists, creating it if necessary.
 */
export const ensureSkillsDirectory = async (): Promise<string> => {
  const dir = getSkillsDirectory();
  await fs.mkdir(dir, { recursive: true });
  return dir;
};
