import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useCreateFolder } from '../../controllers/cloudExplorer.controller';
import type { CloudProvider, CloudStorageConfig } from '../../../types/frontend';

interface CreateFolderDialogProps {
  open: boolean;
  onClose: () => void;
  provider: CloudProvider;
  config: CloudStorageConfig;
  bucketName: string;
  prefix: string;
  onSuccess?: () => void;
}

const schema = z.object({
  folderName: z
    .string()
    .min(1, 'Folder name is required')
    .refine((v) => !v.includes('/') && !v.includes('\\'), {
      message: 'Folder name cannot contain / or \\',
    }),
});

type FormValues = z.infer<typeof schema>;

const CreateFolderDialog: React.FC<CreateFolderDialogProps> = ({
  open,
  onClose,
  provider,
  config,
  bucketName,
  prefix,
  onSuccess,
}) => {
  const {
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { folderName: '' },
  });

  const createMutation = useCreateFolder({
    onSuccess: () => {
      toast.success('Folder created successfully.');
      reset();
      onSuccess?.();
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to create folder.';
      setError('folderName', { message });
    },
  });

  const onSubmit = (values: FormValues) => {
    createMutation.mutate({
      provider,
      config,
      bucketName,
      prefix,
      folderName: values.folderName,
    });
  };

  const handleClose = () => {
    if (createMutation.isLoading) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>Create New Folder</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent>
          <Controller
            name="folderName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Folder name"
                required
                autoFocus
                fullWidth
                error={!!errors.folderName}
                helperText={
                  errors.folderName?.message ||
                  `Will be created at: ${prefix || '/'}${field.value || '<name>'}/`
                }
                disabled={createMutation.isLoading}
              />
            )}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={createMutation.isLoading}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={createMutation.isLoading}
            startIcon={
              createMutation.isLoading ? (
                <CircularProgress size={16} />
              ) : undefined
            }
          >
            Create
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};

export default CreateFolderDialog;
