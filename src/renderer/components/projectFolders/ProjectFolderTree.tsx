import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  CircularProgress,
  IconButton,
  Tooltip,
  Typography,
} from '@mui/material';
import { alpha } from '@mui/material/styles';
import { FolderOpen, NoteAdd } from '@mui/icons-material';
import { useQuery, useQueryClient } from 'react-query';
import { ArboristTree } from '../fileTreeViewer/ArboristTree';
import type { FileStatuses } from '../fileTreeViewer/types';
import { NewFileModal } from '../modals/newFileModal';
import { projectsServices } from '../../services';
import {
  useGetFileStatuses,
  useGetProjects,
  useGitIsInitialized,
} from '../../controllers';
import { QUERY_KEYS } from '../../config/constants';
import { path as nodePath } from '../../lib/path';
import { projectTypeUiOf } from '../../../projectTypes/registry.renderer';
import { projectTypeOf } from '../../../projectTypes/registry.shared';
import type { FileNode, Project } from '../../../types/backend';

/** The project linked to a connection: its folders hold queries and pages. */
export const useConnectionProject = (
  connectionId?: string,
): Project | undefined => {
  const { data: projects = [] } = useGetProjects();
  return useMemo(
    () =>
      connectionId
        ? projects.find((p) => p.connectionId === connectionId && !!p.path)
        : undefined,
    [projects, connectionId],
  );
};

/** One folder of a project as a file tree (`[GET_FILE_STRUCTURE, path]`). */
export const useProjectFolder = (folderPath?: string) =>
  useQuery<FileNode | null>({
    queryKey: [QUERY_KEYS.GET_FILE_STRUCTURE, folderPath],
    queryFn: () =>
      projectsServices
        .loadProjectDirectory({ path: folderPath! })
        .catch(() => null),
    enabled: !!folderPath,
  });

// Keeps files whose name matches and the folders that lead to them
const pruneTree = (node: FileNode, query: string): FileNode | null => {
  if (node.type === 'file') {
    return node.name.toLowerCase().includes(query) ? node : null;
  }
  const children = (node.children ?? [])
    .map((child) => pruneTree(child, query))
    .filter((child): child is FileNode => child !== null);
  return children.length > 0 ? { ...node, children } : null;
};

interface ProjectFolderTreeProps {
  project: Project;
  /** Folder under the project root, e.g. `queries`. */
  folderName: string;
  /** Files that open on click, e.g. `.sql`; others are listed only. */
  fileExtension: string;
  filter: string;
  /** Absolute path of the open file, highlighted. */
  selectedPath?: string;
  onOpenFile: (file: FileNode) => void;
  /**
   * "New file" on the folder row: the feature's own create dialog, or (when
   * absent) the plain new-file dialog. Subfolders and New Folder aren't
   * offered in this phase.
   */
  onCreateFile?: (parentPath: string) => void;
  /** After a delete, rename or move, so lists built on the files refresh. */
  onFilesChanged?: () => void;
  /** Absolute path of a deleted file or folder. */
  onDeleted?: (deletedPath: string) => void;
  /** A file or folder was renamed in the tree (absolute paths). */
  onRenamed?: (oldPath: string, newPath: string) => void;
  /** Shown under the folder row when it has no files (or doesn't exist). */
  emptyText: string;
  testId: string;
}

/**
 * A project folder (queries/, analytics/) in the same file tree the Project
 * screen uses: rename, move, delete and Git badges, with the project's type
 * chip and name above it. Plan 95d.
 */
export const ProjectFolderTree: React.FC<ProjectFolderTreeProps> = ({
  project,
  folderName,
  fileExtension,
  filter,
  selectedPath,
  onOpenFile,
  onCreateFile,
  onFilesChanged,
  onDeleted,
  onRenamed,
  emptyText,
  testId,
}) => {
  const queryClient = useQueryClient();
  const [fileModalPath, setFileModalPath] = useState<string>();
  const folderPath = nodePath.join(project.path, folderName);
  const { data: folder, isLoading } = useProjectFolder(folderPath);
  const { data: isGitRepo } = useGitIsInitialized(project.path, {
    enabled: !!project.path,
  });
  const { data: statuses = [] } = useGetFileStatuses(project.path, {
    enabled: !!project.path && !!isGitRepo,
  });

  const fileStatuses = useMemo(() => {
    const map: FileStatuses = {};
    statuses.forEach((status) => {
      map[status.path] = status.status as FileStatuses[string];
    });
    return map;
  }, [statuses]);

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries([QUERY_KEYS.GET_FILE_STRUCTURE]);
    onFilesChanged?.();
  }, [queryClient, onFilesChanged]);

  // A folder that doesn't exist yet (nothing saved there) still shows its
  // row, empty, like the Local folder; its hover buttons create the first file
  // or folder in it
  const treeData = useMemo(() => {
    const source: FileNode = folder ?? {
      id: folderPath,
      name: folderName,
      path: folderPath,
      type: 'folder',
      children: [],
    };
    const query = filter.trim().toLowerCase();
    if (!query) return source;
    return pruneTree(source, query) ?? { ...source, children: [] };
  }, [folder, filter, folderPath, folderName]);
  const isEmpty = !folder?.children?.length;

  const ProjectIcon = projectTypeUiOf(project).Icon;
  const header = (
    <Tooltip
      title={`${projectTypeOf(project).title}: ${project.name}/${folderName}/`}
      placement="right"
    >
      <Box
        data-testid={`${testId}-project`}
        sx={{
          px: '10px',
          // Type icon (16px) and name (18px line) are centred in the row
          height: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 0,
          flexShrink: 0,
          // Full-width line under the project name; none before the Local folder
          borderBottom: 1,
          borderColor: 'divider',
          mb: 0.5,
        }}
      >
        {/* The project's type icon (no type text) and its name */}
        <Box
          sx={{ display: 'flex', flexShrink: 0 }}
          title={projectTypeOf(project).title}
        >
          <ProjectIcon size={16} />
        </Box>
        <Typography
          noWrap
          sx={{
            fontSize: 13,
            fontWeight: 600,
            minWidth: 0,
            lineHeight: '18px',
          }}
        >
          {project.name}
        </Typography>
      </Box>
    </Tooltip>
  );

  if (isLoading) {
    return (
      <Box data-testid={testId}>
        {header}
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
          <CircularProgress size={20} />
        </Box>
      </Box>
    );
  }

  return (
    <Box
      data-testid={testId}
      sx={{ '& [role="treeitem"]:focus': { outline: 'none' } }}
    >
      {header}
      <ArboristTree
        fitContent
        data={treeData}
        fileStatuses={fileStatuses}
        onFileSelect={(file) => {
          if (file.name.toLowerCase().endsWith(fileExtension)) onOpenFile(file);
        }}
        onRefresh={refresh}
        onCreateFile={onCreateFile ?? setFileModalPath}
        // This phase: new files in the folder itself only, no new folders
        createInRootOnly
        onDeleteSuccess={(deletedPath) => {
          onDeleted?.(deletedPath);
          refresh();
        }}
        onRenameSuccess={(oldPath, newPath) => {
          onRenamed?.(oldPath, newPath);
          refresh();
        }}
        selectedPath={selectedPath}
        projectPath={folderPath}
        copyPath={async (source, target) => {
          await projectsServices.copyPath({ source, target });
          await refresh();
        }}
      />
      {isEmpty && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ px: 2, py: 1, whiteSpace: 'normal', overflowWrap: 'anywhere' }}
        >
          {emptyText}
        </Typography>
      )}
      {fileModalPath && (
        <NewFileModal
          isOpen
          type="file"
          path={fileModalPath}
          onClose={() => setFileModalPath(undefined)}
          successCallback={() => {
            setFileModalPath(undefined);
            refresh();
          }}
        />
      )}
    </Box>
  );
};

/**
 * "Local" folder row (items kept in Studio's app data for the connection,
 * not in the project or Git) right after the project folder (no divider
 * between them; the line sits under the project name), as in the Notebooks
 * tab.
 */
export const SavedInStudioHeading: React.FC<{
  /** Hover + button, like the project folder row's New File. */
  onCreate?: () => void;
  /** Its tooltip, e.g. "New Local Query". */
  createTitle?: string;
}> = ({ onCreate, createTitle = 'New' }) => (
  // Same geometry and hover as the tree's root folder row above it
  // (ArboristTree's 4px inset, TreeNode's 18px open-folder icon, 6px gap, 13px
  // label, 22px row, 8px right padding, 16px action icons), so the two folder
  // rows line up and behave alike
  <Box
    data-testid="local-folder-row"
    sx={{
      pl: '4px',
      pr: 1,
      mt: 0.5,
      height: 22,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      '&:hover': {
        bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
        '& .local-actions': { opacity: 1 },
      },
    }}
  >
    <FolderOpen sx={{ fontSize: 18, color: 'primary.main', flexShrink: 0 }} />
    <Typography sx={{ fontSize: 13, flex: 1, minWidth: 0 }}>Local</Typography>
    {onCreate && (
      <Box
        className="local-actions"
        sx={{ display: 'flex', opacity: 0, transition: 'opacity 0.2s' }}
      >
        <IconButton
          size="small"
          title={createTitle}
          aria-label={createTitle}
          onClick={(e) => {
            e.stopPropagation();
            onCreate();
          }}
          sx={{ padding: '4px' }}
        >
          <NoteAdd sx={{ fontSize: 16 }} />
        </IconButton>
      </Box>
    )}
  </Box>
);
