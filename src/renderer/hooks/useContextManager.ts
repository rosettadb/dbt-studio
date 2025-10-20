import { useState, useMemo, useCallback } from 'react';
import { useSelectedFileContext } from './useSelectedFileContext';
import { useGetSelectedProject } from '../controllers';
import { chatService } from '../services/chat.service';

interface ContextFile {
  path: string;
  name: string;
  relativePath: string;
  fileType: string;
  isSelected?: boolean;
}

interface ContextItem {
  type: string;
  name: string;
  description: string;
  content: string;
  metadata?: any;
}

export const useContextManager = () => {
  const [additionalFiles, setAdditionalFiles] = useState<ContextFile[]>([]);
  const [isResolvingContext, setIsResolvingContext] = useState(false);
  const { selectedFileContext, hasSelectedFile } = useSelectedFileContext();
  const { data: project } = useGetSelectedProject();

  // Get all context items for message sending
  const contextItemsForMessage = useMemo(() => {
    const items: ContextItem[] = [];

    // Always include selected file context first if available
    if (hasSelectedFile && selectedFileContext) {
      items.push({
        type: selectedFileContext.type,
        name: selectedFileContext.name,
        description: selectedFileContext.description,
        content: selectedFileContext.content,
        metadata: selectedFileContext.metadata,
      });
    }

    // Add additional files (these would need to be resolved to context items)
    // For now, we'll just track the files and resolve them when sending

    return items;
  }, [selectedFileContext, hasSelectedFile, additionalFiles]);

  // Get context items including additional files with real content resolution
  const getContextItemsWithAdditionalFiles = useCallback(async () => {
    setIsResolvingContext(true);

    try {
      const items: ContextItem[] = [];

      // Include selected file context first if available
      if (hasSelectedFile && selectedFileContext) {
        items.push({
          type: selectedFileContext.type,
          name: selectedFileContext.name,
          description: selectedFileContext.description,
          content: selectedFileContext.content,
          metadata: selectedFileContext.metadata,
        });
      }

      // Resolve additional files to context items using the actual context service
      if (additionalFiles.length > 0 && project?.path) {
        // eslint-disable-next-line no-console
        console.log(
          `Resolving context for ${additionalFiles.length} additional files...`,
        );

        const resolvePromises = additionalFiles.map(async (file) => {
          try {
            // eslint-disable-next-line no-console
            console.log(`Resolving context for file: ${file.path}`);

            // Use the actual context resolution service
            const resolvedContext =
              await chatService.resolveSelectedFileContext(
                file.path,
                project.path,
              );

            // eslint-disable-next-line no-console
            console.log(`Successfully resolved context for: ${file.name}`);

            return {
              type: resolvedContext.type,
              name: resolvedContext.name,
              description:
                resolvedContext.description ||
                `Additional file: ${file.relativePath}`,
              content: resolvedContext.content,
              metadata: {
                ...resolvedContext.metadata,
                isAdditional: true,
                originalFileType: file.fileType,
              },
            };
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(
              `Failed to resolve context for file: ${file.path}`,
              error,
            );

            // Fallback: create a basic context item with error indication
            return {
              type: 'file',
              name: file.name,
              description: `Additional file: ${file.relativePath} (content unavailable)`,
              content: `File: ${file.relativePath}\n\n[Error loading content: ${error instanceof Error ? error.message : 'Unknown error'}]`,
              metadata: {
                path: file.path,
                relativePath: file.relativePath,
                fileType: file.fileType,
                isAdditional: true,
                hasError: true,
                errorMessage:
                  error instanceof Error ? error.message : 'Unknown error',
              },
            };
          }
        });

        // Wait for all additional files to be resolved
        const resolvedAdditionalItems = await Promise.all(resolvePromises);
        items.push(...resolvedAdditionalItems);

        // eslint-disable-next-line no-console
        console.log(
          `Context resolution complete. Total items: ${items.length}`,
        );
      }

      return items;
    } finally {
      setIsResolvingContext(false);
    }
  }, [selectedFileContext, hasSelectedFile, additionalFiles, project?.path]);

  const addFiles = useCallback((files: ContextFile[]) => {
    setAdditionalFiles((prev) => {
      // Filter out files that are already in context to prevent duplicates
      const existingPaths = prev.map((f) => f.path);
      const newFiles = files.filter(
        (file) => !existingPaths.includes(file.path),
      );
      return [...prev, ...newFiles];
    });
  }, []);

  const removeFile = useCallback((filePath: string) => {
    setAdditionalFiles((prev) => prev.filter((file) => file.path !== filePath));
  }, []);

  const clearAdditionalFiles = useCallback(() => {
    setAdditionalFiles([]);
  }, []);

  const totalContextFiles = (hasSelectedFile ? 1 : 0) + additionalFiles.length;

  // Check if a file is already in context
  const isFileInContext = useCallback(
    (filePath: string) => {
      if (!filePath) return false;

      // Check if it's in additional files
      return additionalFiles.some((file) => file.path === filePath);
    },
    [additionalFiles],
  );

  return {
    // State
    additionalFiles,
    totalContextFiles,
    hasContext: totalContextFiles > 0,
    isResolvingContext,

    // Actions
    setAdditionalFiles,
    addFiles,
    removeFile,
    clearAdditionalFiles,

    // Context items
    contextItemsForMessage,
    getContextItemsWithAdditionalFiles,

    // Utilities
    isFileInContext,
  };
};
