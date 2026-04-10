import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  LinearProgress,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { toast } from 'react-toastify';
import {
  useUploadFile,
  useUploadFolder,
} from '../../controllers/cloudExplorer.controller';
import { cloudExplorerService } from '../../services';
import type {
  CloudProvider,
  CloudStorageConfig,
} from '../../../types/frontend';
import type { UploadProgressEvent } from '../../../types/ipc';

interface UploadItem {
  id: string;
  name: string;
  type: 'file' | 'folder';
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  currentFile?: string;
  fileIndex?: number;
  fileCount?: number;
}

interface UploadDropzoneProps {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
  onUploaded?: () => void;
  onUploadingChange?: (uploading: boolean) => void;
}

const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  provider,
  config,
  bucketName,
  prefix,
  onUploaded,
  onUploadingChange,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const activeItemIdRef = useRef<string | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const updateItem = (id: string, patch: Partial<UploadItem>) =>
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    );

  useEffect(() => {
    unsubscribeRef.current = cloudExplorerService.onUploadProgress(
      (event: UploadProgressEvent) => {
        const id = activeItemIdRef.current;
        if (!id) return;
        updateItem(id, {
          progress: event.percentage,
          currentFile: event.fileName,
          fileIndex: event.fileIndex,
          fileCount: event.fileCount,
        });
      },
    );
    return () => unsubscribeRef.current?.();
  }, []);

  const fileMutation = useUploadFile({
    onSuccess: () => {
      const id = activeItemIdRef.current;
      if (id) updateItem(id, { status: 'done', progress: 100 });
      activeItemIdRef.current = null;
      onUploaded?.();
    },
    onError: (error: unknown) => {
      const id = activeItemIdRef.current;
      if (id) updateItem(id, { status: 'error' });
      activeItemIdRef.current = null;
      const msg = error instanceof Error ? error.message : 'Upload failed.';
      toast.error(msg);
    },
  });

  const folderMutation = useUploadFolder({
    onSuccess: (data) => {
      const id = activeItemIdRef.current;
      if (id) updateItem(id, { status: 'done', progress: 100 });
      activeItemIdRef.current = null;
      if (data.failedCount > 0) {
        toast.warning(
          `Folder uploaded with ${data.failedCount} error(s). ${data.uploadedCount} file(s) succeeded.`,
        );
      } else {
        toast.success(`Folder uploaded — ${data.uploadedCount} file(s).`);
      }
      onUploaded?.();
    },
    onError: (error: unknown) => {
      const id = activeItemIdRef.current;
      if (id) updateItem(id, { status: 'error' });
      activeItemIdRef.current = null;
      const msg =
        error instanceof Error ? error.message : 'Folder upload failed.';
      toast.error(msg);
    },
  });

  const triggerFileUpload = async () => {
    const result = await window.electron.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      {
        properties: ['openFile', 'multiSelections'],
        title: 'Select files to upload',
      },
    );
    if (result.canceled || !result.filePaths?.length) return;

    await (result.filePaths as string[]).reduce(async (prev, localFilePath) => {
      await prev;
      const fileName = localFilePath.split(/[\\/]/).pop() || 'file';
      const id = `${Date.now()}-${fileName}`;
      setItems((p) => [
        ...p,
        {
          id,
          name: fileName,
          type: 'file',
          status: 'uploading',
          progress: 0,
        },
      ]);
      activeItemIdRef.current = id;
      await new Promise<void>((resolve) => {
        fileMutation.mutate(
          { provider, config, bucketName, prefix, localFilePath, fileName },
          { onSettled: () => resolve() },
        );
      });
    }, Promise.resolve());
  };

  const triggerFolderUpload = async () => {
    const result = await window.electron.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      {
        properties: ['openDirectory'],
        title: 'Select a folder to upload',
      },
    );
    if (result.canceled || !result.filePaths?.length) return;

    const localFolderPath: string = result.filePaths[0];
    const folderName = localFolderPath.split(/[\\/]/).pop() || 'folder';
    const id = `${Date.now()}-${folderName}`;
    setItems((p) => [
      ...p,
      {
        id,
        name: folderName,
        type: 'folder',
        status: 'uploading',
        progress: 0,
      },
    ]);
    activeItemIdRef.current = id;
    folderMutation.mutate({
      provider,
      config,
      bucketName,
      prefix,
      localFolderPath,
    });
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setIsDragOver(false), []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      await Array.from(e.dataTransfer.items).reduce(
        async (prev, droppedItem) => {
          await prev;
          const entry = droppedItem.webkitGetAsEntry?.();
          if (!entry) return;

          if (entry.isFile) {
            const file = droppedItem.getAsFile();
            if (!file) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localFilePath = (file as any).path as string;
            if (!localFilePath) return;
            const fileName = file.name;
            const id = `${Date.now()}-${fileName}`;
            setItems((p) => [
              ...p,
              {
                id,
                name: fileName,
                type: 'file',
                status: 'uploading',
                progress: 0,
              },
            ]);
            activeItemIdRef.current = id;
            await new Promise<void>((resolve) => {
              fileMutation.mutate(
                {
                  provider,
                  config,
                  bucketName,
                  prefix,
                  localFilePath,
                  fileName,
                },
                { onSettled: () => resolve() },
              );
            });
          } else if (entry.isDirectory) {
            const file = droppedItem.getAsFile();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const localFolderPath = file
              ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (file as any).path?.replace(/[\\/][^\\/]+$/, '')
              : null;
            if (!localFolderPath) {
              toast.warning(
                'Drag-and-drop folder upload requires selecting via the "Upload Folder" button on some systems.',
              );
              return;
            }
            const folderName = entry.name;
            const id = `${Date.now()}-${folderName}`;
            setItems((p) => [
              ...p,
              {
                id,
                name: folderName,
                type: 'folder',
                status: 'uploading',
                progress: 0,
              },
            ]);
            activeItemIdRef.current = id;
            folderMutation.mutate({
              provider,
              config,
              bucketName,
              prefix,
              localFolderPath,
            });
          }
        },
        Promise.resolve(),
      );
    },
    [provider, config, bucketName, prefix, fileMutation, folderMutation],
  );

  const isUploading =
    items.some((it) => it.status === 'uploading') ||
    fileMutation.isLoading ||
    folderMutation.isLoading;

  useEffect(() => {
    onUploadingChange?.(isUploading);
  }, [isUploading, onUploadingChange]);

  const doneCount = items.filter((it) => it.status === 'done').length;
  const errorCount = items.filter((it) => it.status === 'error').length;
  const activeItem = items.find((it) => it.status === 'uploading');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: 420 }}>
      {/* Dropzone area */}
      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          border: '2px dashed',
          borderColor: isDragOver ? 'primary.main' : 'divider',
          borderRadius: 2,
          p: 3,
          textAlign: 'center',
          bgcolor: isDragOver ? 'action.hover' : 'background.paper',
          transition: 'all 0.15s ease',
          cursor: 'default',
          flexShrink: 0,
        }}
      >
        <CloudUploadIcon
          sx={{
            fontSize: 40,
            color: isDragOver ? 'primary.main' : 'text.disabled',
            mb: 1,
          }}
        />
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Drag &amp; drop files or folders here
        </Typography>
        <Box
          sx={{ display: 'flex', gap: 1, justifyContent: 'center', mt: 1.5 }}
        >
          <Button
            size="small"
            variant="outlined"
            startIcon={<UploadFileIcon />}
            onClick={triggerFileUpload}
            disabled={isUploading}
          >
            Upload Files
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FolderOpenIcon />}
            onClick={triggerFolderUpload}
            disabled={isUploading}
          >
            Upload Folder
          </Button>
        </Box>
      </Box>

      {/* Queue section */}
      <Box
        sx={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          mt: 1.5,
        }}
      >
        {/* Status bar + progress — fixed height to prevent jumping */}
        <Box sx={{ flexShrink: 0, px: 0.5, minHeight: 52 }}>
          {items.length > 0 && (
            <Typography variant="caption" color="text.secondary">
              {isUploading
                ? `Uploading${activeItem ? ` "${activeItem.name}"` : ''}...`
                : `${doneCount} done${errorCount > 0 ? `, ${errorCount} failed` : ''}`}
            </Typography>
          )}
          <Box sx={{ mt: 0.5, minHeight: 28 }}>
            {activeItem ? (
              <>
                <LinearProgress
                  variant="determinate"
                  value={activeItem.progress}
                  sx={{ borderRadius: 1 }}
                />
                {activeItem.type === 'folder' &&
                  activeItem.fileIndex != null &&
                  activeItem.fileCount != null && (
                    <Typography variant="caption" color="text.secondary">
                      {activeItem.fileIndex}/{activeItem.fileCount}
                      {activeItem.currentFile
                        ? ` — ${activeItem.currentFile}`
                        : ''}
                    </Typography>
                  )}
              </>
            ) : (
              <Box sx={{ height: 4 }} />
            )}
          </Box>
        </Box>

        {/* Scrollable file list */}
        {items.length > 0 && (
          <Box
            sx={{
              flex: 1,
              overflowY: 'auto',
              mt: 1,
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              pr: 1,
            }}
          >
            <List dense disablePadding sx={{ px: 1, py: 0.5 }}>
              {items.map((item) => (
                <ListItem key={item.id} disableGutters sx={{ py: 0.5 }}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    {item.type === 'folder' ? (
                      <FolderOpenIcon fontSize="small" color="action" />
                    ) : (
                      <UploadFileIcon fontSize="small" color="action" />
                    )}
                  </ListItemIcon>
                  <ListItemText
                    primary={item.name}
                    primaryTypographyProps={{
                      variant: 'caption',
                      noWrap: true,
                    }}
                    sx={{ mr: 1 }}
                  />
                  {item.status === 'done' && (
                    <CheckCircleOutlineIcon fontSize="small" color="success" />
                  )}
                  {item.status === 'error' && (
                    <ErrorOutlineIcon fontSize="small" color="error" />
                  )}
                  {item.status === 'uploading' && (
                    <Box sx={{ width: 60, flexShrink: 0 }}>
                      <LinearProgress
                        variant="determinate"
                        value={item.progress}
                        sx={{ borderRadius: 1 }}
                      />
                    </Box>
                  )}
                </ListItem>
              ))}
            </List>
          </Box>
        )}
      </Box>
    </Box>
  );
};

export default UploadDropzone;
