import React, { useCallback, useRef, useState } from 'react';
import { styled } from '@mui/material/styles';
import { settingsServices } from '../../services';

const DropZoneWrapper = styled('div')({
  width: '100%',
  height: '100%',
  position: 'relative',
});

interface ExternalDropZoneProps {
  children: React.ReactNode;
  projectPath: string;
  onFilesDropped: (files: File[], targetPath: string) => Promise<void>;
  onDragOverFolder?: (folderPath: string | null) => void;
}

export const ExternalDropZone: React.FC<ExternalDropZoneProps> = ({
  children,
  projectPath,
  onFilesDropped,
  onDragOverFolder,
}) => {
  const [hoveredFolderPath, setHoveredFolderPath] = useState<string | null>(
    null,
  );
  const dragCounter = useRef(0);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const types = Array.from(e.dataTransfer.types);
    const hasFiles = types.includes('Files') || e.dataTransfer.files.length > 0;
    const isInternalDrag = types.includes('application/json') && !hasFiles;

    if (hasFiles && !isInternalDrag) {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current += 1;
    }
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      const types = Array.from(e.dataTransfer.types);
      const hasFiles =
        types.includes('Files') || e.dataTransfer.files.length > 0;
      const isInternalDrag = types.includes('application/json') && !hasFiles;

      if (hasFiles && !isInternalDrag) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';

        const target = e.target as HTMLElement;
        const nodeElement = target.closest('[data-node-path]') as HTMLElement;

        if (nodeElement) {
          const nodePath = nodeElement.getAttribute('data-node-path');
          const nodeType = nodeElement.getAttribute('data-node-type');

          if (nodeType === 'folder' && nodePath) {
            if (hoveredFolderPath !== nodePath) {
              setHoveredFolderPath(nodePath);
              onDragOverFolder?.(nodePath);
            }
          } else {
            // eslint-disable-next-line no-lonely-if
            if (hoveredFolderPath !== null) {
              setHoveredFolderPath(null);
              onDragOverFolder?.(null);
            }
          }
        } else {
          // Dragging over empty space below the tree - target is root folder
          // eslint-disable-next-line no-lonely-if
          if (hoveredFolderPath !== projectPath) {
            setHoveredFolderPath(projectPath);
            onDragOverFolder?.(projectPath);
          }
        }
      }
    },
    [hoveredFolderPath, onDragOverFolder, projectPath],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      // Only handle external OS file drags, not internal react-arborist drags
      const types = Array.from(e.dataTransfer.types);
      const hasFiles =
        types.includes('Files') || e.dataTransfer.files.length > 0;
      const isInternalDrag = types.includes('application/json') && !hasFiles;

      if (hasFiles && !isInternalDrag) {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current === 0) {
          setHoveredFolderPath(null);
          onDragOverFolder?.(null);
        }
      }
    },
    [onDragOverFolder],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>) => {
      // Only handle external OS file drags, not internal react-arborist drags
      const types = Array.from(e.dataTransfer.types);
      const hasFiles =
        types.includes('Files') || e.dataTransfer.files.length > 0;
      const isInternalDrag = types.includes('application/json') && !hasFiles;

      if (!hasFiles || isInternalDrag) {
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      dragCounter.current = 0;

      // Determine drop target
      const target = e.target as HTMLElement;
      const nodeElement = target.closest('[data-node-path]') as HTMLElement;
      let targetPath = projectPath;

      if (nodeElement) {
        const nodePath = nodeElement.getAttribute('data-node-path');
        const nodeType = nodeElement.getAttribute('data-node-type');

        if (nodeType === 'folder' && nodePath) {
          targetPath = nodePath;
        } else if (nodePath) {
          // Dropped on a file, use its parent directory
          try {
            const parentDir = await settingsServices.getDirname(nodePath);
            targetPath = parentDir || projectPath;
          } catch {
            // Fallback to projectPath if dirname fails
            targetPath = projectPath;
          }
        }
      }

      // Collect all items (files and folders) using the FileSystem API
      const items: File[] = [];

      // Try to use items API first (supports folders in Electron)
      if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
        for (let i = 0; i < e.dataTransfer.items.length; i += 1) {
          const item = e.dataTransfer.items[i];

          // In Electron, we can get the file/folder directly from the item
          if (item.kind === 'file') {
            const file = item.getAsFile();
            if (file && (file as any).path) {
              items.push(file);
            }
          }
        }
      } else {
        // Fallback to files API
        const files = Array.from(e.dataTransfer.files);
        items.push(...files);
      }

      if (items.length === 0) {
        return;
      }

      setHoveredFolderPath(null);
      onDragOverFolder?.(null);

      try {
        await onFilesDropped(items, targetPath);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[ExternalDropZone] onFilesDropped failed:', err);
      }
    },
    [projectPath, onFilesDropped, onDragOverFolder],
  );

  return (
    <DropZoneWrapper
      ref={wrapperRef}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {children}
    </DropZoneWrapper>
  );
};
