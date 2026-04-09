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
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  FormHelperText,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useCreateBucket } from '../../controllers/cloudExplorer.controller';
import { AWS_REGIONS, GCS_REGIONS } from '../../config/cloudRegions';
import type { CloudProvider, CloudStorageConfig } from '../../../types/frontend';

// Inline bucket name validation (mirrors backend CloudExplorerService.validateBucketName)
function validateBucketName(
  provider: CloudProvider,
  name: string,
): { valid: boolean; error?: string } {
  try {
    if (!name || name.length === 0) {
      return { valid: false, error: 'Bucket name must not be empty.' };
    }
    const ipPattern = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
    if (provider === 'aws') {
      if (name.length < 3 || name.length > 63)
        return { valid: false, error: 'Bucket name must be between 3 and 63 characters.' };
      if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name))
        return { valid: false, error: 'Only lowercase letters, numbers, and hyphens. Must start and end with a letter or number.' };
      if (/--/.test(name))
        return { valid: false, error: 'Bucket name must not contain consecutive hyphens.' };
      if (ipPattern.test(name))
        return { valid: false, error: 'Bucket name must not be formatted as an IP address.' };
      return { valid: true };
    }
    if (provider === 'azure') {
      if (name.length < 3 || name.length > 63)
        return { valid: false, error: 'Container name must be between 3 and 63 characters.' };
      if (!/^[a-z0-9][a-z0-9-]*$/.test(name))
        return { valid: false, error: 'Only lowercase letters, numbers, and hyphens. Must start with a letter or number.' };
      return { valid: true };
    }
    if (provider === 'gcs') {
      if (name.length < 3 || name.length > 63)
        return { valid: false, error: 'Bucket name must be between 3 and 63 characters.' };
      if (!/^[a-z0-9][a-z0-9\-_.]*[a-z0-9]$/.test(name))
        return { valid: false, error: 'Only lowercase letters, numbers, hyphens, underscores, and dots.' };
      if (name.includes('..'))
        return { valid: false, error: 'Bucket name must not contain consecutive dots.' };
      if (ipPattern.test(name))
        return { valid: false, error: 'Bucket name must not be formatted as an IP address.' };
      return { valid: true };
    }
    if (name.length < 3 || name.length > 63)
      return { valid: false, error: 'Bucket name must be between 3 and 63 characters.' };
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name))
      return { valid: false, error: 'Only lowercase letters, numbers, and hyphens.' };
    return { valid: true };
  } catch {
    return { valid: false, error: 'Bucket name validation failed.' };
  }
}

interface CreateBucketDialogProps {
  open: boolean;
  onClose: () => void;
  provider: CloudProvider;
  config: CloudStorageConfig;
  onSuccess?: (bucketName: string) => void;
}

const schema = z.object({
  bucketName: z.string().min(1, 'Bucket name is required'),
  region: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

const CreateBucketDialog: React.FC<CreateBucketDialogProps> = ({
  open,
  onClose,
  provider,
  config,
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
    defaultValues: { bucketName: '', region: '' },
  });

  const createMutation = useCreateBucket({
    onSuccess: (data) => {
      toast.success(`Bucket "${data.bucketName}" created successfully.`);
      reset();
      onSuccess?.(data.bucketName);
      onClose();
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : 'Failed to create bucket.';
      setError('bucketName', { message });
    },
  });

  const showRegion = provider === 'aws' || provider === 'gcs';
  const regionOptions = provider === 'aws' ? AWS_REGIONS : GCS_REGIONS;

  const onSubmit = (values: FormValues) => {
    // Client-side bucket name validation
    const validation = validateBucketName(provider, values.bucketName);
    if (!validation.valid) {
      setError('bucketName', { message: validation.error });
      return;
    }

    createMutation.mutate({
      provider,
      config,
      bucketName: values.bucketName,
      region: values.region || undefined,
    });
  };

  const handleClose = () => {
    if (createMutation.isLoading) return;
    reset();
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create New Bucket</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Controller
            name="bucketName"
            control={control}
            render={({ field }) => (
              <TextField
                {...field}
                label="Bucket name"
                required
                autoFocus
                error={!!errors.bucketName}
                helperText={errors.bucketName?.message}
                disabled={createMutation.isLoading}
                fullWidth
              />
            )}
          />
          {showRegion && (
            <Controller
              name="region"
              control={control}
              render={({ field }) => (
                <FormControl fullWidth error={!!errors.region}>
                  <InputLabel id="region-label">Region</InputLabel>
                  <Select
                    {...field}
                    labelId="region-label"
                    label="Region"
                    disabled={createMutation.isLoading}
                  >
                    <MenuItem value="">
                      <em>Select a region</em>
                    </MenuItem>
                    {regionOptions.map((r) => (
                      <MenuItem key={r} value={r}>
                        {r}
                      </MenuItem>
                    ))}
                  </Select>
                  {errors.region && (
                    <FormHelperText>{errors.region.message}</FormHelperText>
                  )}
                </FormControl>
              )}
            />
          )}
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

export default CreateBucketDialog;
