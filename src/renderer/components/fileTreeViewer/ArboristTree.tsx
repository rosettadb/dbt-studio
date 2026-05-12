/* eslint-disable react/jsx-props-no-spreading,no-restricted-syntax,no-continue,no-await-in-loop,no-plusplus */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { MoveHandler, NodeApi, RenameHandler, Tree } from 'react-arborist';
import { styled } from '@mui/material/styles';
import { toast } from 'react-toastify';
import {
  CopiedNode,
  FileNode,
  FileStatuses,
  TreeContextMenuState,
} from './types';
import { TreeNode } from './TreeNode';
import { TreeContextMenu } from './TreeContextMenu';
import { ExternalDropZone } from './ExternalDropZone';
import { MoveConfirmDialog } from './MoveConfirmDialog';
import { DeleteConfirmDialog } from './DeleteConfirmDialog';
import { projectsServices } from '../../services';

const TreeContainer = styled('div')({
  width: '100%',
  height: 'calc(100% - 60px)',
  overflow: 'hidden',
});

interface ArboristTreeProps {
  data: FileNode;
  fileStatuses: FileStatuses;
  onFileSelect: (file: FileNode) => void;
  onRefresh: () => void;
  onCreateFile: (parentPath: string) => void;
  onCreateFolder: (parentPath: string) => void;
  onDeleteSuccess: (path: string) => void;
  onRenameSuccess?: (oldPath: string, newPath: string) => void;
  selectedPath?: string;
  projectPath: string;
  copyPath: (source: string, target: string) => Promise<void>;
}

const buildTreeStructure = (node: FileNode): FileNode => {
  // Sort children: folders first, then files, each sorted alphabetically by name
  const sortedChildren = node.children?.map(buildTreeStructure).sort((a, b) => {
    // First, sort by type (folders before files)
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    // Then, sort alphabetically by name (case-insensitive)
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  return {
    id: node.path,
    name: node.name,
    path: node.path,
    type: node.type,
    children: sortedChildren,
  };
};

export const ArboristTree: React.FC<ArboristTreeProps> = ({
  data,
  fileStatuses,
  onFileSelect,
  onRefresh,
  onCreateFile,
  onCreateFolder,
  onDeleteSuccess,
  onRenameSuccess,
  selectedPath,
  projectPath,
  copyPath,
}) => {
  const treeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState<number>(500);
  const [contextMenu, setContextMenu] = useState<TreeContextMenuState | null>(
    null,
  );
  const [copiedNode, setCopiedNode] = useState<CopiedNode | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);
  const [pendingOperation, setPendingOperation] = useState<{
    sourcePath: string;
    targetPath: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  // eslint-disable-next-line no-undef
  const expandTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Measure container height
  React.useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const height = containerRef.current.clientHeight;
        if (height > 0) {
          setContainerHeight(height);
        }
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  const treeData = useMemo(() => {
    return [buildTreeStructure(data)];
  }, [data]);

  const handleSelect = useCallback(
    (nodes: NodeApi<FileNode>[]) => {
      if (nodes.length > 0) {
        const selectedNode = nodes[0].data;
        if (selectedNode.type === 'file') {
          onFileSelect(selectedNode);
        }
      }
    },
    [onFileSelect],
  );

  const handleMove: MoveHandler<FileNode> = useCallback(
    async ({ dragIds, parentId }) => {
      // eslint-disable-next-line no-console
      console.log('[ArboristTree] handleMove called', {
        dragIds,
        parentId,
        projectPath,
      });

      const dragId = dragIds[0];
      const targetParent = parentId || projectPath;
      const sourcePath = dragId;

      // Get the current parent of the source
      const sourceParent = sourcePath.substring(0, sourcePath.lastIndexOf('/'));

      // eslint-disable-next-line no-console
      console.log('[ArboristTree] move details', {
        sourcePath,
        sourceParent,
        targetParent,
        sameFolder: sourceParent === targetParent,
      });

      // If dropping in the same folder, do nothing
      if (sourceParent === targetParent) {
        // eslint-disable-next-line no-console
        console.log('[ArboristTree] same folder, ignoring');
        return;
      }

      // Show dialog with Move/Copy options
      setPendingOperation({ sourcePath, targetPath: targetParent });
    },
    [projectPath],
  );

  // Handle rename
  const handleRename: RenameHandler<FileNode> = useCallback(
    async ({ id, name }) => {
      try {
        const oldPath = id;

        const newPath = await projectsServices.renamePath({
          path: oldPath,
          newName: name,
        });

        if (onRenameSuccess) {
          onRenameSuccess(oldPath, newPath);
        }

        toast.info('Renamed');
        onRefresh();
      } catch (error) {
        toast.error('Rename failed');
      }
    },
    [onRefresh, onRenameSuccess],
  );

  // Disable dragging for root folder
  const disableDrag: any = useCallback(
    (node: NodeApi<FileNode>) => {
      if (!node || !node.data) return false;
      return node.data.path === projectPath;
    },
    [projectPath],
  );

  const disableDrop = useCallback(({ parentNode, dragNodes }: any) => {
    if (parentNode && parentNode.data.type === 'file') {
      return true;
    }
    return !!dragNodes.some((dragNode: any) => {
      if (!parentNode) return false;
      if (dragNode.id === parentNode.id) return true;
      return parentNode.id.startsWith(`${dragNode.id}/`);
    });
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback(
    (event: React.MouseEvent, node: FileNode) => {
      event.preventDefault();
      setContextMenu({
        mouseX: event.clientX,
        mouseY: event.clientY,
        node,
      });
    },
    [],
  );

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleRenameFromMenu = useCallback(() => {
    if (!contextMenu) return;

    // Find the node in the tree and trigger edit
    const node = treeRef.current?.get(contextMenu.node.id);
    if (node) {
      node.edit();
    }
  }, [contextMenu]);

  const handleDelete = useCallback((path: string) => {
    // Show confirmation dialog
    setPendingDelete(path);
  }, []);

  const handleDeleteFromMenu = useCallback(() => {
    if (!contextMenu) return;
    setPendingDelete(contextMenu.node.path);
  }, [contextMenu]);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;

    try {
      await projectsServices.deleteItem({ filePath: pendingDelete });
      toast.info('Deleted');
      onDeleteSuccess(pendingDelete);
      onRefresh();
    } catch (error) {
      toast.error('Delete failed');
    } finally {
      setPendingDelete(null);
    }
  }, [pendingDelete, onDeleteSuccess, onRefresh]);

  const handleCancelDelete = useCallback(() => {
    setPendingDelete(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (!contextMenu) return;

    setCopiedNode({
      path: contextMenu.node.path,
      type: contextMenu.node.type,
      name: contextMenu.node.name,
    });
  }, [contextMenu]);

  const handlePaste = useCallback(async () => {
    if (!contextMenu || !copiedNode) return;

    try {
      // Pass the target directory path (not the full file path)
      // copyPath will append the source basename automatically
      await copyPath(copiedNode.path, contextMenu.node.path);
      // Use a small delay before refresh to ensure the file system operation completes
      setTimeout(() => {
        onRefresh();
      }, 100);
    } catch (error) {
      toast.error('Paste failed');
    }
  }, [contextMenu, copiedNode, copyPath, onRefresh]);

  const handleCopyPath = useCallback(() => {
    if (!contextMenu) return;

    navigator.clipboard.writeText(contextMenu.node.path);
  }, [contextMenu]);

  const handleNewFileFromMenu = useCallback(() => {
    if (!contextMenu) return;
    onCreateFile(contextMenu.node.path);
  }, [contextMenu, onCreateFile]);

  const handleNewFolderFromMenu = useCallback(() => {
    if (!contextMenu) return;
    onCreateFolder(contextMenu.node.path);
  }, [contextMenu, onCreateFolder]);

  // Handle drag over folder with auto-expand
  const handleDragOverFolderChange = useCallback(
    (folderPath: string | null) => {
      // Clear any existing timer
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
        expandTimerRef.current = null;
      }

      setDragOverFolder(folderPath);

      if (folderPath && treeRef.current) {
        expandTimerRef.current = setTimeout(() => {
          const node = treeRef.current?.get(folderPath);
          if (node && !node.isOpen && node.isInternal) {
            node.open();
          }
          expandTimerRef.current = null;
        }, 800);
      }
    },
    [],
  );

  React.useEffect(() => {
    return () => {
      if (expandTimerRef.current) {
        clearTimeout(expandTimerRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (treeRef.current && data.path) {
      const rootNode = treeRef.current.get(data.path);
      if (rootNode && !rootNode.isOpen) {
        rootNode.open();
      }
    }
  }, [data]);

  const handleExternalFilesDropped = useCallback(
    async (files: File[], targetPath: string) => {
      try {
        let successCount = 0;
        let folderCount = 0;
        let fileCount = 0;

        for (const file of files) {
          const sourcePath = (file as any).path;
          if (!sourcePath) {
            toast.error(`No path: ${file.name}`);
            continue;
          }
          try {
            // In Electron, directories have empty type, while files have MIME types
            // This is a heuristic to detect if the dropped item is a folder
            const isDirectory = file.type === '';

            await copyPath(sourcePath, targetPath);
            successCount++;

            if (isDirectory) {
              folderCount++;
            } else {
              fileCount++;
            }
          } catch (copyError) {
            toast.error(`Copy failed: ${file.name}`);
          }
        }

        if (successCount > 0) {
          let message = '';
          const parts: string[] = [];

          if (folderCount > 0) {
            parts.push(`${folderCount} folder${folderCount > 1 ? 's' : ''}`);
          }
          if (fileCount > 0) {
            parts.push(`${fileCount} file${fileCount > 1 ? 's' : ''}`);
          }

          message = `${parts.join(' and ')} copied`;
          toast.info(message);
          onRefresh();
        } else {
          toast.error('No items were imported');
        }
      } catch (error) {
        toast.error('Import failed');
      }
    },
    [copyPath, onRefresh],
  );

  // Handle move confirmation
  const handleConfirmMove = useCallback(async () => {
    if (!pendingOperation) return;

    try {
      // First, copy the item to the target location
      await copyPath(pendingOperation.sourcePath, pendingOperation.targetPath);

      // Calculate the actual target path after copy
      // (copyPath may append basename if not already present)
      const sourceBasename = pendingOperation.sourcePath.split('/').pop() || '';
      const targetBasename = pendingOperation.targetPath.split('/').pop() || '';
      const actualTargetPath =
        sourceBasename === targetBasename
          ? pendingOperation.targetPath
          : `${pendingOperation.targetPath}/${sourceBasename}`;

      // Try to delete the source item
      try {
        await projectsServices.deleteItem({
          filePath: pendingOperation.sourcePath,
        });

        // Only on success: clear state and refresh (no toast message)
        setPendingOperation(null);
        onRefresh();
      } catch (deleteError) {
        // Delete failed - attempt rollback by removing the copied item
        try {
          await projectsServices.deleteItem({
            filePath: actualTargetPath,
          });
        } catch {
          /* empty */
        }

        // Surface detailed error to user
        const errorMsg =
          deleteError instanceof Error
            ? deleteError.message
            : String(deleteError);
        toast.error(`Move failed: Could not delete source. ${errorMsg}`);

        // Do NOT clear pendingOperation so user can retry
      }
    } catch (copyError) {
      // Copy failed - show error but also don't clear pendingOperation
      const errorMsg =
        copyError instanceof Error ? copyError.message : String(copyError);
      toast.error(`Move failed: Could not copy to target. ${errorMsg}`);
    }
  }, [pendingOperation, copyPath, onRefresh]);

  // Handle copy confirmation
  const handleConfirmCopy = useCallback(async () => {
    if (!pendingOperation) return;

    try {
      await copyPath(pendingOperation.sourcePath, pendingOperation.targetPath);
      toast.info('Item copied');
      onRefresh();
    } catch (error) {
      toast.error('Copy failed');
    } finally {
      setPendingOperation(null);
    }
  }, [pendingOperation, copyPath, onRefresh]);

  const handleCancelOperation = useCallback(() => {
    setPendingOperation(null);
  }, []);

  return (
    <>
      <ExternalDropZone
        projectPath={projectPath}
        onFilesDropped={handleExternalFilesDropped}
        onDragOverFolder={handleDragOverFolderChange}
      >
        <TreeContainer ref={containerRef}>
          <Tree
            ref={treeRef}
            data={treeData}
            openByDefault={false}
            width="100%"
            height={containerHeight}
            indent={20}
            rowHeight={22}
            overscanCount={10}
            onSelect={handleSelect}
            onMove={handleMove}
            onRename={handleRename}
            disableDrag={disableDrag}
            disableDrop={disableDrop}
            selection={selectedPath}
            idAccessor="id"
          >
            {(props) => (
              <TreeNode
                {...props}
                fileStatuses={fileStatuses}
                onContextMenu={handleContextMenu}
                onCreateFile={onCreateFile}
                onCreateFolder={onCreateFolder}
                onDelete={handleDelete}
                dragOverFolder={dragOverFolder}
                projectPath={projectPath}
              />
            )}
          </Tree>
        </TreeContainer>
      </ExternalDropZone>

      <TreeContextMenu
        contextMenu={contextMenu}
        copiedNode={copiedNode}
        onClose={handleCloseContextMenu}
        onRename={handleRenameFromMenu}
        onDelete={handleDeleteFromMenu}
        onCopy={handleCopy}
        onPaste={handlePaste}
        onCopyPath={handleCopyPath}
        onNewFile={handleNewFileFromMenu}
        onNewFolder={handleNewFolderFromMenu}
      />

      <MoveConfirmDialog
        open={!!pendingOperation}
        sourcePath={pendingOperation?.sourcePath || ''}
        targetPath={pendingOperation?.targetPath || ''}
        onMove={handleConfirmMove}
        onCopy={handleConfirmCopy}
        onCancel={handleCancelOperation}
      />

      <DeleteConfirmDialog
        open={!!pendingDelete}
        path={pendingDelete || ''}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
      />
    </>
  );
};
