import { gitServices, projectsServices } from '../../services';

export interface DiscardAgentChangesResult {
  restoredPaths: string[];
  deletedPaths: string[];
}

export interface AgentChangedFile {
  path: string;
  added: number;
  removed: number;
  created: boolean;
  originalContent?: string;
}

export const mergeAgentChangedFile = (
  previous: AgentChangedFile | undefined,
  next: AgentChangedFile,
): AgentChangedFile => ({
  ...next,
  created: previous?.created === true || next.created,
  originalContent: previous?.originalContent ?? next.originalContent,
});

/**
 * Revert files changed by an agent run without closing their editor tabs.
 * Tracked files are restored by Git and then pushed into any open Monaco tab.
 * Files created by the agent run are deleted and closed only after deletion.
 */
export const discardAgentChanges = async (
  projectPath: string,
  files: AgentChangedFile[],
  syncEditorContent?: (path: string, content: string) => void,
  closeFile?: (path: string) => void,
): Promise<DiscardAgentChangesResult> => {
  const createdFiles = files.filter((file) => file.created);
  const existingFiles = files.filter((file) => !file.created);
  const snapshottedFiles = existingFiles.filter(
    (file) => file.originalContent !== undefined,
  );
  const gitFallbackFiles = existingFiles.filter(
    (file) => file.originalContent === undefined,
  );

  const deletedPaths = await Promise.all(
    createdFiles.map(async ({ path }) => {
      await projectsServices.deleteItem({ filePath: path });
      closeFile?.(path);
      return path;
    }),
  );

  await Promise.all(
    snapshottedFiles.map(async ({ path, originalContent }) => {
      await projectsServices.saveFileContent({
        path,
        content: originalContent!,
      });
    }),
  );

  if (gitFallbackFiles.length > 0) {
    await gitServices.discardChanges(
      projectPath,
      gitFallbackFiles.map((file) => file.path),
    );
  }

  const restoredPaths = await Promise.all(
    existingFiles.map(async ({ path: filePath }) => {
      try {
        const content = await projectsServices.getFileContent({
          path: filePath,
        });
        syncEditorContent?.(filePath, content);
        return filePath;
      } catch {
        throw new Error(`Failed to restore existing file: ${filePath}`);
      }
    }),
  );

  return { restoredPaths, deletedPaths };
};
