import React, { useCallback, useMemo, useState } from 'react';
import {
  Box,
  Chip,
  CircularProgress,
  Tooltip,
  Typography,
} from '@mui/material';
import { useQueryClient } from 'react-query';
import { ArboristTree } from '../fileTreeViewer/ArboristTree';
import type { FileStatuses } from '../fileTreeViewer/types';
import { NewFileModal } from '../modals';
import { projectsServices } from '../../services';
import { useGetFileStatuses, useGitIsInitialized } from '../../controllers';
import {
  pythonNotebooksKeys,
  useProjectNotebooksFolder,
} from '../../controllers/pythonNotebooks.controller';
import { pythonNotebooksService } from '../../services/pythonNotebooks.service';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { path as nodePath, toPosix } from '../../lib/path';
import { PROJECT_NOTEBOOKS_DIR } from '../../../shared/projectNotebooks';
import { projectTypeUiOf } from '../../../projectTypes/registry.renderer';
import { projectTypeOf } from '../../../projectTypes/registry.shared';
import type { FileNode, Project } from '../../../types/backend';
import type { PythonNotebook } from '../../../types/pythonNotebooks';

interface ProjectNotebooksTreeProps {
  /** The project linked to the active connection. */
  project: Project;
  /** Its notebooks, from `usePythonProjectNotebooks`. */
  notebooks: PythonNotebook[];
  filter: string;
  /** Id of the notebook in the active tab, highlighted in the tree. */
  activeNotebookId?: string;
  onOpenNotebook: (notebook: PythonNotebook) => void;
  /** "New file" in the tree: notebooks are created through the create dialog. */
  onCreateNotebook: () => void;
  /** Notebooks whose files were deleted from the tree (to close their tabs). */
  onNotebooksDeleted: (notebookIds: string[]) => void;
}

const isNotebookFile = (name: string) => name.toLowerCase().endsWith('.ipynb');

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

/**
 * The project's `notebooks/` folder in the Project screen's file tree (same
 * component, rename / move / delete / git badges). Opening a `.ipynb` opens it
 * as a notebook; other files are listed but open from the Project screen.
 */
export const ProjectNotebooksTree: React.FC<ProjectNotebooksTreeProps> = ({
  project,
  notebooks,
  filter,
  activeNotebookId,
  onOpenNotebook,
  onCreateNotebook,
  onNotebooksDeleted,
}) => {
  const queryClient = useQueryClient();
  const refreshProjectFiles = useRefreshProjectFiles();
  const [folderModalPath, setFolderModalPath] = useState<string>();

  const folderPath = nodePath.join(project.path, PROJECT_NOTEBOOKS_DIR);
  const { data: folder, isLoading } = useProjectNotebooksFolder(folderPath);
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

  // Absolute file path (posix) → notebook
  const notebookByPath = useMemo(() => {
    const map = new Map<string, PythonNotebook>();
    notebooks.forEach((notebook) => {
      if (!notebook.project?.relativePath) return;
      const filePath = nodePath.join(
        project.path,
        notebook.project.relativePath,
      );
      map.set(toPosix(filePath), notebook);
    });
    return map;
  }, [notebooks, project.path]);

  const selectedPath = useMemo(() => {
    const active = notebooks.find((n) => n.id === activeNotebookId);
    return active?.project?.relativePath
      ? nodePath.join(project.path, active.project.relativePath)
      : undefined;
  }, [notebooks, activeNotebookId, project.path]);

  const refresh = useCallback(async () => {
    await Promise.all([
      refreshProjectFiles(),
      queryClient.invalidateQueries(
        pythonNotebooksKeys.projectList(project.id),
      ),
    ]);
  }, [refreshProjectFiles, queryClient, project.id]);

  const handleFileSelect = useCallback(
    async (file: FileNode) => {
      if (!isNotebookFile(file.name)) return;
      const key = toPosix(file.path);
      const known = notebookByPath.get(key);
      if (known) {
        onOpenNotebook(known);
        return;
      }
      // Added outside Studio since the last list: read the folder again
      const fresh = await queryClient.fetchQuery(
        pythonNotebooksKeys.projectList(project.id),
        () => pythonNotebooksService.listForProject(project.id),
      );
      const found = fresh.find(
        (notebook) =>
          notebook.project?.relativePath &&
          toPosix(
            nodePath.join(project.path, notebook.project.relativePath),
          ) === key,
      );
      if (found) onOpenNotebook(found);
    },
    [notebookByPath, onOpenNotebook, queryClient, project.id, project.path],
  );

  const handleDeleted = useCallback(
    (deletedPath: string) => {
      const prefix = toPosix(deletedPath);
      const ids = Array.from(notebookByPath.entries())
        .filter(
          ([filePath]) =>
            filePath === prefix || filePath.startsWith(`${prefix}/`),
        )
        .map(([, notebook]) => notebook.id);
      if (ids.length > 0) onNotebooksDeleted(ids);
    },
    [notebookByPath, onNotebooksDeleted],
  );

  const treeData = useMemo(() => {
    if (!folder) return null;
    const query = filter.trim().toLowerCase();
    if (!query) return folder;
    const pruned = pruneTree(folder, query);
    return pruned ?? { ...folder, children: [] };
  }, [folder, filter]);

  // The project the notebooks folder belongs to, above the tree: its type
  // badge (the project cards' chip, smaller), then its name
  const ProjectIcon = projectTypeUiOf(project).Icon;
  const header = (
    <Tooltip
      title={`Notebooks in ${project.name}/${PROJECT_NOTEBOOKS_DIR}/`}
      placement="right"
    >
      <Box
        data-testid="notebooks-linked-project"
        sx={{
          px: '10px',
          pt: '2px',
          pb: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          minWidth: 0,
          flexShrink: 0,
        }}
      >
        <Chip
          size="small"
          data-testid="notebooks-linked-project-type"
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <ProjectIcon size={11} />
              {projectTypeOf(project).shortTitle}
            </Box>
          }
          sx={{
            height: 18,
            flexShrink: 0,
            fontWeight: 500,
            fontSize: 11,
            bgcolor: 'background.paper',
            color: 'text.secondary',
            border: '1px solid',
            borderColor: 'divider',
            '& .MuiChip-label': { px: '6px' },
          }}
        />
        <Typography noWrap sx={{ fontSize: 12, fontWeight: 500, minWidth: 0 }}>
          {project.name}
        </Typography>
      </Box>
    </Tooltip>
  );

  if (isLoading || !treeData) {
    return (
      <Box>
        {header}
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
            <CircularProgress size={20} />
          </Box>
        ) : (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              px: 2,
              py: 1,
              whiteSpace: 'normal',
              overflowWrap: 'anywhere',
            }}
          >
            No notebooks in {project.name}/{PROJECT_NOTEBOOKS_DIR}/ yet. Click
            the + button to create one.
          </Typography>
        )}
      </Box>
    );
  }

  return (
    // As tall as its rows: the Studio notebooks follow right below it, and
    // the Notebooks tab scrolls both. No focus ring on the clicked row; the
    // selection highlight shows it.
    <Box sx={{ '& [role="treeitem"]:focus': { outline: 'none' } }}>
      {header}
      <ArboristTree
        fitContent
        data={treeData}
        fileStatuses={fileStatuses}
        onFileSelect={handleFileSelect}
        onRefresh={refresh}
        onCreateFile={onCreateNotebook}
        onCreateFolder={setFolderModalPath}
        onDeleteSuccess={handleDeleted}
        onRenameSuccess={refresh}
        selectedPath={selectedPath}
        projectPath={folderPath}
        copyPath={async (source, target) => {
          await projectsServices.copyPath({ source, target });
          await refresh();
        }}
      />
      {folderModalPath && (
        <NewFileModal
          isOpen
          type="folder"
          path={folderModalPath}
          onClose={() => setFolderModalPath(undefined)}
          successCallback={() => {
            setFolderModalPath(undefined);
            refresh();
          }}
        />
      )}
    </Box>
  );
};
