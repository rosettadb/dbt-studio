import React from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Grid,
  Alert,
  FormControlLabel,
  Checkbox,
  Divider,
} from '@mui/material';
import { Save, Storage } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// Validation schema for instance editing
const instanceFormSchema = z.object({
  name: z.string().min(1, 'Instance name is required').max(50, 'Name too long'),
  description: z.string().optional(),
  runtime: z.object({
    maxMemory: z.string().optional(),
    threads: z.number().min(1).max(32).optional(),
    enableOptimizer: z.boolean(),
    tempDirectory: z.string().optional(),
  }),
});

type InstanceFormData = z.infer<typeof instanceFormSchema>;

interface DuckLakeInstance {
  id: string;
  name: string;
  status: 'active' | 'inactive' | 'error';
  dataPath: string;
  catalog: {
    type: 'duckdb' | 'sqlite' | 'postgresql';
    duckdb?: { metadataPath: string };
    sqlite?: { metadataPath: string };
    postgresql?: {
      host: string;
      port: number;
      database: string;
      username: string;
      ssl: boolean;
    };
  };
  runtime?: {
    maxMemory?: string;
    threads?: number;
    enableOptimizer?: boolean;
    tempDirectory?: string;
  };
  createdAt: string;
  updatedAt: string;
  description?: string;
}

interface DuckLakeInstanceFormProps {
  instance: DuckLakeInstance;
  onSave?: (instanceId: string, data: InstanceFormData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
  mode?: 'edit' | 'view';
}

export const DuckLakeInstanceForm: React.FC<DuckLakeInstanceFormProps> = ({
  instance,
  onSave,
  onCancel,
  isLoading = false,
  mode = 'edit',
}) => {
  const navigate = useNavigate();
  const isReadOnly = mode === 'view';

  const form = useForm<InstanceFormData>({
    resolver: zodResolver(instanceFormSchema),
    defaultValues: {
      name: instance.name,
      description: instance.description || '',
      runtime: {
        maxMemory: instance.runtime?.maxMemory || '4GB',
        threads: instance.runtime?.threads || 4,
        enableOptimizer: instance.runtime?.enableOptimizer ?? true,
        tempDirectory: instance.runtime?.tempDirectory || '',
      },
    },
  });

  const handleSave = async (data: InstanceFormData) => {
    if (onSave) {
      onSave(instance.id, data);
    }
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate(`/app/duck-lake/instances/${instance.id}`);
    }
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
            <Storage color="primary" />
            {isReadOnly ? 'View' : 'Edit'} Instance
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
                      disabled={isReadOnly || isLoading}
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
                      multiline
                      rows={3}
                      disabled={isReadOnly || isLoading}
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
                  Data path and catalog configuration cannot be modified after
                  creation. Create a new instance if you need different
                  settings.
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

              {/* Catalog-specific read-only fields */}
              {instance.catalog.type === 'duckdb' &&
                instance.catalog.duckdb && (
                  <Grid item xs={12}>
                    <TextField
                      label="Metadata Path"
                      value={instance.catalog.duckdb.metadataPath}
                      fullWidth
                      disabled
                      helperText="Cannot be modified after creation"
                    />
                  </Grid>
                )}

              {instance.catalog.type === 'sqlite' &&
                instance.catalog.sqlite && (
                  <Grid item xs={12}>
                    <TextField
                      label="Metadata Path"
                      value={instance.catalog.sqlite.metadataPath}
                      fullWidth
                      disabled
                      helperText="Cannot be modified after creation"
                    />
                  </Grid>
                )}

              {instance.catalog.type === 'postgresql' &&
                instance.catalog.postgresql && (
                  <>
                    <Grid item xs={12} sm={8}>
                      <TextField
                        label="Host"
                        value={instance.catalog.postgresql.host}
                        fullWidth
                        disabled
                        helperText="Cannot be modified after creation"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Port"
                        value={instance.catalog.postgresql.port}
                        fullWidth
                        disabled
                        helperText="Cannot be modified after creation"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Database"
                        value={instance.catalog.postgresql.database}
                        fullWidth
                        disabled
                        helperText="Cannot be modified after creation"
                      />
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Username"
                        value={instance.catalog.postgresql.username}
                        fullWidth
                        disabled
                        helperText="Cannot be modified after creation"
                      />
                    </Grid>
                  </>
                )}

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
                      disabled={isReadOnly || isLoading}
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
                      disabled={isReadOnly || isLoading}
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
                          disabled={isReadOnly || isLoading}
                        />
                      }
                      label="Enable Query Optimizer"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="runtime.tempDirectory"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Temporary Directory"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Directory for temporary files during processing (optional)'
                      }
                      disabled={isReadOnly || isLoading}
                      placeholder="/tmp/ducklake"
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
              <Button onClick={handleCancel} disabled={isLoading}>
                {isReadOnly ? 'Close' : 'Cancel'}
              </Button>
              {!isReadOnly && (
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<Save />}
                  disabled={isLoading}
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </Button>
              )}
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
