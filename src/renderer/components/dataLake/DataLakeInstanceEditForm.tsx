import React from 'react';
import { useParams, Navigate, useNavigate } from 'react-router-dom';
import {
  Box,
  CircularProgress,
  Alert,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import { Save, Folder, Cloud, CloudQueue } from '@mui/icons-material';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  useDuckLakeInstance,
  useUpdateDuckLakeInstance,
} from '../../controllers/duckLake.controller';

// Validation schema for instance editing (only editable fields)
export const instanceEditSchema = z.object({
  name: z.string().min(1, 'Instance name is required').max(50, 'Name too long'),
  description: z.string().optional(),
  runtime: z.object({
    maxMemory: z.string().optional(),
    threads: z.number().min(1).max(32).optional(),
    enableOptimizer: z.boolean(),
  }),
});

type InstanceEditData = z.infer<typeof instanceEditSchema>;

export const DataLakeInstanceEditForm: React.FC = () => {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const instanceQuery = useDuckLakeInstance(instanceId || '');
  const updateMutation = useUpdateDuckLakeInstance();

  const form = useForm<InstanceEditData>({
    resolver: zodResolver(instanceEditSchema),
    defaultValues: instanceQuery.data
      ? {
          name: instanceQuery.data.name,
          description: instanceQuery.data.description || '',
          runtime: {
            maxMemory: instanceQuery.data.runtimeOptions?.maxMemory || '4GB',
            threads: instanceQuery.data.runtimeOptions?.threads || 4,
            enableOptimizer:
              instanceQuery.data.runtimeOptions?.enableOptimizer ?? true,
          },
        }
      : undefined,
  });

  if (!instanceId) {
    return <Navigate to="/app/data-lake/duck-lake/instances" replace />;
  }

  if (instanceQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (instanceQuery.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">
          Failed to load instance: {String(instanceQuery.error)}
        </Alert>
      </Box>
    );
  }

  if (!instanceQuery.data) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error">Instance not found</Alert>
      </Box>
    );
  }

  const instance = instanceQuery.data;

  // Get storage icon based on data path type
  const getStorageIcon = () => {
    const dataPath = instance.dataPath.toLowerCase();
    if (dataPath.startsWith('s3://')) {
      return <Cloud color="primary" />;
    }
    if (dataPath.startsWith('az://') || dataPath.startsWith('azure://')) {
      return <CloudQueue color="primary" />;
    }
    if (dataPath.startsWith('gs://') || dataPath.startsWith('gcs://')) {
      return <Cloud color="primary" />;
    }
    // Local path
    return <Folder color="primary" />;
  };

  const handleSave = async (data: InstanceEditData) => {
    // Transform form data to match DuckLakeInstanceUpdateRequest
    // Note: tempDirectory is intentionally excluded from updates
    const updateRequest = {
      name: data.name,
      description: data.description,
      runtimeOptions: {
        maxMemory: data.runtime.maxMemory,
        threads: data.runtime.threads,
        enableOptimizer: data.runtime.enableOptimizer,
        // Keep existing tempDirectory unchanged
        tempDirectory: instance.runtimeOptions?.tempDirectory,
      },
    };

    await updateMutation.mutateAsync({
      instanceId,
      data: updateRequest,
    });

    navigate(`/app/data-lake/duck-lake/instances/${instanceId}`);
  };

  const handleCancel = () => {
    navigate(`/app/data-lake/duck-lake/instances/${instanceId}`);
  };

  return (
    <Box sx={{ p: 2 }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Box>
          <Typography
            variant="h4"
            component="h1"
            sx={{
              fontWeight: 'bold',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            {getStorageIcon()}
            Edit Instance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {instance.name} • {instance.catalog.type.toUpperCase()} Catalog
          </Typography>
        </Box>
      </Box>

      <Card sx={{ maxWidth: 800 }}>
        <CardContent sx={{ p: 3 }}>
          <form onSubmit={form.handleSubmit(handleSave)}>
            <Grid container spacing={3}>
              {/* Basic Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Basic Information
                </Typography>
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="name"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Instance Name"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={fieldState.error?.message}
                      disabled={updateMutation.isLoading}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="description"
                  control={form.control}
                  render={({ field }) => (
                    <TextField
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Description"
                      fullWidth
                      rows={3}
                      disabled={updateMutation.isLoading}
                      placeholder="Describe the purpose of this DuckLake instance..."
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
              </Grid>

              {/* Read-only Configuration Info */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Configuration (Read-only)
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  Data path, catalog configuration, and temporary directory
                  cannot be modified after creation. Create a new instance if
                  you need different settings.
                </Alert>
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Data Path"
                  value={instance.dataPath}
                  fullWidth
                  disabled
                  helperText="Cannot be modified after creation"
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Catalog Type"
                  value={instance.catalog.type.toUpperCase()}
                  fullWidth
                  disabled
                  helperText="Cannot be modified after creation"
                />
              </Grid>

              <Grid item xs={12}>
                <TextField
                  label="Temporary Directory"
                  value={instance.runtimeOptions?.tempDirectory || 'Default'}
                  fullWidth
                  disabled
                  helperText="Cannot be modified after creation"
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
              </Grid>

              {/* Runtime Options - Editable */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Runtime Options
                </Typography>
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ mb: 2 }}
                >
                  These settings can be modified and will take effect on the
                  next connection.
                </Typography>
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="runtime.maxMemory"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Max Memory"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Maximum memory allocation (e.g., 4GB, 8GB)'
                      }
                      disabled={updateMutation.isLoading}
                      placeholder="4GB"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="runtime.threads"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value}
                      onBlur={field.onBlur}
                      label="Thread Count"
                      type="number"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Number of threads for parallel processing'
                      }
                      disabled={updateMutation.isLoading}
                      inputProps={{ min: 1, max: 32 }}
                      onChange={(e) =>
                        field.onChange(parseInt(e.target.value, 10) || 4)
                      }
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="runtime.enableOptimizer"
                  control={form.control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.value}
                          onChange={field.onChange}
                          disabled={updateMutation.isLoading}
                        />
                      }
                      label="Enable Query Optimizer"
                    />
                  )}
                />
              </Grid>
            </Grid>

            {/* Action Buttons */}
            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: 2,
                mt: 4,
              }}
            >
              <Button
                onClick={handleCancel}
                disabled={updateMutation.isLoading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                startIcon={<Save />}
                disabled={updateMutation.isLoading}
              >
                {updateMutation.isLoading ? 'Saving...' : 'Save Changes'}
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
