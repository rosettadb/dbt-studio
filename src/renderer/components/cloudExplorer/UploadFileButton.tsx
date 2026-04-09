import React, { useEffect, useRef, useState } from 'react';
import { IconButton, LinearProgress, Tooltip, Box } from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { toast } from 'react-toastify';
import { useUploadFile } from '../../controllers/cloudExplorer.controller';
import { cloudExplorerService } from '../../services';
import type { CloudProvider, CloudStorageConfig } from '../../../types/frontend';

interface UploadFileButtonProps {
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
}

const UploadFileButton: React.FC<UploadFileButtonProps> = ({
  provider,
  config,
  bucketName,
  prefix,
}) => {
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const uploadMutation = useUploadFile({
    onSuccess: () => {
      setUploadProgress(null);
      toast.success('File uploaded successfully.');
    },
    onError: (error: unknown) => {
      setUploadProgress(null);
      const message =
        error instanceof Error ? error.message : 'Upload failed.';
      toast.error(message);
    },
  });

  useEffect(() => {
    const unsubscribe = cloudExplorerService.onUploadProgress((event) => {
      setUploadProgress(event.percentage);
    });
    unsubscribeRef.current = unsubscribe;

    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  const handleClick = async () => {
    const result = await window.electron.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      {
        properties: ['openFile'],
        title: 'Select a file to upload',
      },
    );

    if (result.canceled || !result.filePaths?.length) return;

    const localFilePath: string = result.filePaths[0];
    const fileName = localFilePath.split(/[\\/]/).pop() || 'file';

    uploadMutation.mutate({
      provider,
      config,
      bucketName,
      prefix,
      localFilePath,
      fileName,
    });
  };

  const isUploading = uploadMutation.isLoading;

  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
      <Tooltip title="Upload file">
        <span>
          <IconButton
            onClick={handleClick}
            disabled={isUploading}
            size="small"
            aria-label="Upload file"
          >
            <UploadFileIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
      {isUploading && uploadProgress !== null && (
        <Box sx={{ width: 80 }}>
          <LinearProgress
            variant="determinate"
            value={uploadProgress}
            aria-label={`Upload progress: ${uploadProgress}%`}
          />
        </Box>
      )}
      {isUploading && uploadProgress === null && (
        <Box sx={{ width: 80 }}>
          <LinearProgress aria-label="Upload in progress" />
        </Box>
      )}
    </Box>
  );
};

export default UploadFileButton;
