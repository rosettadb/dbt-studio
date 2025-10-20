import { useQuery } from 'react-query';
import { useMemo } from 'react';
import useAppContext from './useAppContext';
import { useGetSelectedProject } from '../controllers';
import { chatService } from '../services/chat.service';
import { QUERY_KEYS } from '../config/constants';
import type { CustomError } from '../../types/backend';
// Using any for now since we have a type mismatch between resolved context and database context
type ResolvedContextItem = any;

/**
 * Hook to automatically resolve context for the currently selected file
 * This provides GitHub Copilot-like automatic context inclusion
 */
export const useSelectedFileContext = () => {
  const { editingFilePath } = useAppContext();
  const { data: project } = useGetSelectedProject();

  // Query for selected file context with caching and stale time
  const {
    data: selectedFileContext,
    isLoading,
    error,
    refetch,
  } = useQuery<ResolvedContextItem | null, CustomError>({
    queryKey: [
      QUERY_KEYS.GET_SELECTED_FILE_CONTEXT,
      editingFilePath,
      project?.id,
    ],
    queryFn: async () => {
      if (!editingFilePath || !project) return null;

      try {
        return await chatService.resolveSelectedFileContext(
          editingFilePath,
          project.path,
        );
      } catch (err) {
        // Log error but don't throw to prevent UI crashes
        // eslint-disable-next-line no-console
        console.error('Failed to resolve selected file context:', err);
        return null;
      }
    },
    enabled: !!editingFilePath && !!project,
    staleTime: 30000, // 30 seconds - context is fresh for 30s
    cacheTime: 300000, // 5 minutes - keep in cache for 5 minutes
    retry: 2, // Retry failed requests twice
    retryDelay: 1000, // 1 second delay between retries
  });

  // Derived state for easier consumption
  const contextState = useMemo(() => {
    return {
      // Context data
      selectedFileContext,

      // State flags
      hasSelectedFile: !!editingFilePath,
      hasContext: !!selectedFileContext,
      isLoading,
      hasError: !!error,

      // File information
      selectedFilePath: editingFilePath,
      selectedFileName: editingFilePath
        ? editingFilePath.split('/').pop() || ''
        : '',

      // Project information
      projectPath: project?.path,
      projectId: project?.id,

      // Context metadata
      contextMetadata: selectedFileContext?.metadata,
      fileType: (selectedFileContext?.metadata as any)?.fileType || 'other',
      tokenCount: (selectedFileContext?.metadata as any)?.tokenCount || 0,

      // Actions
      refetch,
      error,
    };
  }, [
    selectedFileContext,
    editingFilePath,
    project,
    isLoading,
    error,
    refetch,
  ]);

  return contextState;
};

/**
 * Hook to get file metadata without full content resolution
 * Useful for quick file information display
 */
export const useFileMetadata = (filePath?: string) => {
  const {
    data: metadata,
    isLoading,
    error,
  } = useQuery({
    queryKey: [QUERY_KEYS.GET_FILE_METADATA, filePath],
    queryFn: async () => {
      if (!filePath) return null;
      return chatService.getFileMetadata(filePath);
    },
    enabled: !!filePath,
    staleTime: 60000, // 1 minute - metadata is fresh for 1 minute
    cacheTime: 600000, // 10 minutes - keep metadata in cache longer
  });

  return {
    metadata,
    isLoading,
    error,
    hasMetadata: !!metadata,
  };
};

/**
 * Hook to check if a file has DBT-specific context
 */
export const useIsDBTFile = (filePath?: string) => {
  const { metadata } = useFileMetadata(filePath);

  return useMemo(() => {
    if (!metadata) return false;

    const dbtFileTypes = [
      'model',
      'macro',
      'test',
      'snapshot',
      'seed',
      'schema',
      'project_config',
    ];
    return dbtFileTypes.includes(metadata.fileType);
  }, [metadata]);
};

/**
 * Hook to get context items array for message sending
 * Automatically includes selected file context if available
 */
export const useContextItemsForMessage = (additionalContext?: any[]) => {
  const { selectedFileContext, hasContext } = useSelectedFileContext();

  return useMemo(() => {
    const contextItems: any[] = [];

    // Always include selected file context if available
    if (hasContext && selectedFileContext) {
      contextItems.push(selectedFileContext);
    }

    // Add any additional context items
    if (additionalContext && additionalContext.length > 0) {
      contextItems.push(...additionalContext);
    }

    return contextItems;
  }, [selectedFileContext, hasContext, additionalContext]);
};
