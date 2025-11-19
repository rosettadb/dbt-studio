import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Stepper,
  Step,
  StepLabel,
  Button,
  TextField,
  FormControl,
  Alert,
  Chip,
  Grid,
  Paper,
  List,
  ListItem,
  ListItemText,
  FormLabel,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import {
  Dataset as Database,
  Settings,
  CheckCircle,
  Info,
  Folder,
  Security,
  ArrowForward,
  ArrowBack,
  Close,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import connectionIcons from '../../../../assets/connectionIcons';
import sqliteIcon from '../../../../assets/connectionIcons/sqlite.png';

// Database icons mapping - import from assets
const getDatabaseIcon = (type: string) => {
  switch (type) {
    case 'duckdb':
      return connectionIcons.images.duckdb;
    case 'sqlite':
      return sqliteIcon;
    case 'postgresql':
      return connectionIcons.images.postgres;
    default:
      return connectionIcons.images.duckdb;
  }
};

// Validation schemas
const instanceBasicsSchema = z.object({
  name: z.string().min(1, 'Instance name is required').max(50, 'Name too long'),
  dataPath: z.string().min(1, 'Data path is required'),
  description: z.string().optional(),
});

const catalogConfigSchema = z
  .object({
    type: z.enum(['duckdb', 'sqlite', 'postgresql']),
    duckdb: z
      .object({
        metadataPath: z
          .string()
          .min(1, 'Catalog database file path is required')
          .refine(
            (path) => path.endsWith('.db') || path.endsWith('.duckdb'),
            'DuckDB metadata path must end with .db or .duckdb extension',
          ),
      })
      .optional(),
    sqlite: z
      .object({
        metadataPath: z
          .string()
          .min(1, 'Metadata path is required')
          .refine(
            (path) => path.endsWith('.db') || path.endsWith('.sqlite'),
            'SQLite metadata path must end with .db or .sqlite extension',
          ),
      })
      .optional(),
    postgresql: z
      .object({
        host: z.string().min(1, 'Host is required'),
        port: z.number().min(1).max(65535),
        database: z.string().min(1, 'Database name is required'),
        username: z.string().min(1, 'Username is required'),
        password: z.string().min(1, 'Password is required'),
        ssl: z.boolean(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      // Validate that the appropriate catalog config is present based on type
      if (data.type === 'duckdb') {
        return !!data.duckdb?.metadataPath;
      }
      if (data.type === 'sqlite') {
        return !!data.sqlite?.metadataPath;
      }
      if (data.type === 'postgresql') {
        return (
          !!data.postgresql?.host &&
          !!data.postgresql?.database &&
          !!data.postgresql?.username &&
          !!data.postgresql?.password
        );
      }
      return false;
    },
    {
      message: 'Please fill in all required catalog configuration fields',
      path: ['type'],
    },
  );

const runtimeOptionsSchema = z.object({
  maxMemory: z.string().optional(),
  threads: z.number().min(1).max(32).optional(),
  enableOptimizer: z.boolean(),
  tempDirectory: z.string().optional(),
});

const getNextButtonLabel = (loading: boolean, finalStep: boolean) => {
  if (loading) {
    return 'Creating...';
  }

  if (finalStep) {
    return 'Create Instance';
  }

  return 'Next';
};

type InstanceBasics = z.infer<typeof instanceBasicsSchema>;
type CatalogConfig = z.infer<typeof catalogConfigSchema>;
type RuntimeOptions = z.infer<typeof runtimeOptionsSchema>;

interface WizardData {
  basics: InstanceBasics;
  catalog: CatalogConfig;
  runtime: RuntimeOptions;
}

const steps = [
  'Instance Details',
  'Catalog Configuration',
  'Runtime Options',
  'Review & Create',
];

const catalogTypeInfo = {
  duckdb: {
    title: 'DuckDB',
    description: 'Single-client, persistent file-based catalog',
    pros: [
      'Fastest performance',
      'Simple setup',
      'No external dependencies',
      'Persistent storage',
    ],
    cons: ['Single client only', 'No concurrent access'],
    recommended: 'Personal analytics workstation',
  },
  sqlite: {
    title: 'SQLite',
    description: 'Multi-client with light concurrency',
    pros: ['Multiple clients', 'File-based', 'Good for teams'],
    cons: ['Limited concurrency', 'No remote access'],
    recommended: 'Team collaboration on local network',
  },
  postgresql: {
    title: 'PostgreSQL',
    description: 'Multi-user, remote-access lakehouse',
    pros: ['Full concurrency', 'Remote access', 'ACID transactions'],
    cons: ['Requires PostgreSQL server', 'More complex setup'],
    recommended: 'Production multi-user environments',
  },
};

interface DuckLakeConnectionWizardProps {
  onComplete?: (data: WizardData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

export const DuckLakeConnectionWizard: React.FC<
  DuckLakeConnectionWizardProps
> = ({ onComplete, onCancel, isLoading = false }) => {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);
  const [wizardData, setWizardData] = useState<Partial<WizardData>>({});
  const isFinalStep = activeStep === steps.length - 1;
  const nextButtonLabel = getNextButtonLabel(isLoading, isFinalStep);

  // Form for current step
  const basicsForm = useForm<InstanceBasics>({
    resolver: zodResolver(instanceBasicsSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.basics || {
      name: '',
      dataPath: '',
      description: '',
    },
  });

  const catalogForm = useForm<CatalogConfig>({
    resolver: zodResolver(catalogConfigSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.catalog || {
      type: 'duckdb',
    },
  });

  const runtimeForm = useForm<RuntimeOptions>({
    resolver: zodResolver(runtimeOptionsSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.runtime || {
      maxMemory: '4GB',
      threads: 4,
      enableOptimizer: true,
      tempDirectory: '',
    },
  });

  // Reset form errors when step changes
  useEffect(() => {
    basicsForm.clearErrors();
    catalogForm.clearErrors();
    runtimeForm.clearErrors();
  }, [activeStep, basicsForm, catalogForm, runtimeForm]);

  const selectedCatalogType = catalogForm.watch('type');

  useEffect(() => {
    if (!selectedCatalogType) {
      return;
    }

    const clearCatalogFields = (
      fields: ('duckdb' | 'sqlite' | 'postgresql')[],
    ) => {
      fields.forEach((field) => {
        catalogForm.setValue(field, undefined, {
          shouldValidate: false,
          shouldDirty: false,
        });
      });
      catalogForm.clearErrors(fields);
    };

    if (selectedCatalogType === 'duckdb') {
      clearCatalogFields(['sqlite', 'postgresql']);
      return;
    }

    if (selectedCatalogType === 'sqlite') {
      clearCatalogFields(['duckdb', 'postgresql']);
      return;
    }

    if (selectedCatalogType === 'postgresql') {
      clearCatalogFields(['duckdb', 'sqlite']);
    }
  }, [catalogForm, selectedCatalogType]);

  const handleNext = async () => {
    let isValid = false;

    switch (activeStep) {
      case 0: {
        isValid = await basicsForm.trigger();
        if (isValid) {
          const data = basicsForm.getValues();
          setWizardData((prev) => ({ ...prev, basics: data }));
        }
        break;
      }
      case 1: {
        isValid = await catalogForm.trigger();
        if (isValid) {
          const data = catalogForm.getValues();
          setWizardData((prev) => ({ ...prev, catalog: data }));
        }
        break;
      }
      case 2: {
        isValid = await runtimeForm.trigger();
        if (isValid) {
          const data = runtimeForm.getValues();
          setWizardData((prev) => ({ ...prev, runtime: data }));
        }
        break;
      }
      case 3: {
        // Final step - create instance
        if (
          onComplete &&
          wizardData.basics &&
          wizardData.catalog &&
          wizardData.runtime
        ) {
          // Clean up empty optional fields
          const cleanedRuntime = {
            ...wizardData.runtime,
            maxMemory: wizardData.runtime.maxMemory || undefined,
            tempDirectory: wizardData.runtime.tempDirectory || undefined,
          };

          onComplete({
            basics: wizardData.basics,
            catalog: wizardData.catalog,
            runtime: cleanedRuntime,
          });
        }
        return;
      }
      default:
        return;
    }

    if (isValid) {
      setActiveStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setActiveStep((prev) => prev - 1);
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    } else {
      navigate('/app/duck-lake/instances');
    }
  };

  const renderStepContent = () => {
    switch (activeStep) {
      case 0:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Instance Details
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Provide basic information about your DuckLake instance.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="name"
                  control={basicsForm.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Instance Name"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'A unique name for this DuckLake instance'
                      }
                      placeholder="e.g., Analytics Lake, ML Training Data"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="dataPath"
                  control={basicsForm.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Data Path"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Directory where DuckLake will store data files'
                      }
                      placeholder="/path/to/data"
                      InputProps={{
                        startAdornment: (
                          <Folder sx={{ mr: 1, color: 'text.secondary' }} />
                        ),
                      }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="description"
                  control={basicsForm.control}
                  render={({ field }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Description (Optional)"
                      fullWidth
                      multiline
                      rows={3}
                      placeholder="Describe the purpose of this DuckLake instance..."
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        );

      case 1:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Catalog Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Choose the catalog backend that best fits your use case.
            </Typography>

            <Controller
              name="type"
              control={catalogForm.control}
              render={({ field }) => (
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">Catalog Type</FormLabel>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    {Object.entries(catalogTypeInfo).map(([type, info]) => (
                      <Grid item xs={12} sm={4} key={type}>
                        <Card
                          variant={
                            field.value === type ? 'elevation' : 'outlined'
                          }
                          sx={{
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            height: '140px',
                            border:
                              field.value === type ? '2px solid' : '1px solid',
                            borderColor:
                              field.value === type ? 'primary.main' : 'divider',
                            '&:hover': {
                              elevation: 4,
                              borderColor: 'primary.main',
                            },
                          }}
                          onClick={() => field.onChange(type)}
                        >
                          <Box
                            sx={{
                              p: 2,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 1,
                            }}
                          >
                            <Box
                              component="img"
                              src={getDatabaseIcon(type)}
                              alt={info.title}
                              sx={{
                                width: 56,
                                height: 56,
                                objectFit: 'contain',
                              }}
                            />
                            <Typography
                              variant="body2"
                              textAlign="center"
                              fontWeight="medium"
                            >
                              {info.title}
                            </Typography>
                          </Box>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Show selected catalog details */}
                  {field.value && (
                    <Paper sx={{ p: 2, mt: 3, bgcolor: 'background.default' }}>
                      <Typography
                        variant="subtitle2"
                        gutterBottom
                        sx={{ fontWeight: 'bold' }}
                      >
                        {
                          catalogTypeInfo[
                            field.value as keyof typeof catalogTypeInfo
                          ].title
                        }
                      </Typography>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ mb: 2 }}
                      >
                        {
                          catalogTypeInfo[
                            field.value as keyof typeof catalogTypeInfo
                          ].description
                        }
                      </Typography>
                      <Box
                        sx={{
                          display: 'flex',
                          gap: 1,
                          mb: 2,
                          flexWrap: 'wrap',
                        }}
                      >
                        {catalogTypeInfo[
                          field.value as keyof typeof catalogTypeInfo
                        ].pros.map((pro, index) => (
                          <Chip
                            key={index}
                            label={pro}
                            size="small"
                            color="success"
                            variant="outlined"
                          />
                        ))}
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        <strong>Recommended for:</strong>{' '}
                        {
                          catalogTypeInfo[
                            field.value as keyof typeof catalogTypeInfo
                          ].recommended
                        }
                      </Typography>
                    </Paper>
                  )}
                </FormControl>
              )}
            />

            {/* Catalog-specific configuration */}
            {catalogForm.watch('type') === 'duckdb' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  DuckDB Configuration
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    DuckDB will create a persistent database file to store
                    catalog metadata. This file will be created automatically if
                    it doesn&apos;t exist. The file must have a .db or .duckdb
                    extension.
                  </Typography>
                </Alert>
                <Controller
                  name="duckdb.metadataPath"
                  control={catalogForm.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Catalog Database File"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Path where DuckDB will store the catalog database file (must end with .db or .duckdb)'
                      }
                      placeholder="/path/to/ducklake-catalog.duckdb"
                      InputProps={{
                        startAdornment: (
                          <Folder sx={{ mr: 1, color: 'text.secondary' }} />
                        ),
                      }}
                    />
                  )}
                />
              </Box>
            )}

            {catalogForm.watch('type') === 'sqlite' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  SQLite Configuration
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2">
                    SQLite will store catalog metadata in a database file. The
                    file must have a .db or .sqlite extension.
                  </Typography>
                </Alert>
                <Controller
                  name="sqlite.metadataPath"
                  control={catalogForm.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Metadata Path"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Path to SQLite metadata file (must end with .db or .sqlite)'
                      }
                      placeholder="/path/to/metadata.sqlite"
                      InputProps={{
                        startAdornment: (
                          <Folder sx={{ mr: 1, color: 'text.secondary' }} />
                        ),
                      }}
                    />
                  )}
                />
              </Box>
            )}

            {catalogForm.watch('type') === 'postgresql' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  PostgreSQL Configuration
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={8}>
                    <Controller
                      name="postgresql.host"
                      control={catalogForm.control}
                      render={({ field, fieldState }) => (
                        <TextField
                          name={field.name}
                          value={field.value || ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          label="Host"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          placeholder="localhost"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={4}>
                    <Controller
                      name="postgresql.port"
                      control={catalogForm.control}
                      render={({ field, fieldState }) => (
                        <TextField
                          name={field.name}
                          value={field.value || 5432}
                          onBlur={field.onBlur}
                          label="Port"
                          type="number"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          placeholder="5432"
                          onChange={(e) =>
                            field.onChange(parseInt(e.target.value, 10) || 5432)
                          }
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="postgresql.database"
                      control={catalogForm.control}
                      render={({ field, fieldState }) => (
                        <TextField
                          name={field.name}
                          value={field.value || ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          label="Database"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          placeholder="ducklake"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Controller
                      name="postgresql.username"
                      control={catalogForm.control}
                      render={({ field, fieldState }) => (
                        <TextField
                          name={field.name}
                          value={field.value || ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          label="Username"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          placeholder="postgres"
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Controller
                      name="postgresql.password"
                      control={catalogForm.control}
                      render={({ field, fieldState }) => (
                        <TextField
                          name={field.name}
                          value={field.value || ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          label="Password"
                          type="password"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          InputProps={{
                            startAdornment: (
                              <Security
                                sx={{ mr: 1, color: 'text.secondary' }}
                              />
                            ),
                          }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Controller
                      name="postgresql.ssl"
                      control={catalogForm.control}
                      render={({ field }) => (
                        <FormControlLabel
                          control={
                            <Checkbox
                              checked={field.value}
                              onChange={(
                                e: React.ChangeEvent<HTMLInputElement>,
                              ) => field.onChange(e.target.checked)}
                            />
                          }
                          label="Enable SSL/TLS (Recommended for production)"
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </Box>
            )}
          </Box>
        );

      case 2:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Runtime Options
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Configure performance and runtime settings for your DuckLake
              instance.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} sm={6}>
                <Controller
                  name="maxMemory"
                  control={runtimeForm.control}
                  render={({ field }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Max Memory"
                      fullWidth
                      helperText="Maximum memory allocation (e.g., 4GB, 8GB)"
                      placeholder="4GB"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="threads"
                  control={runtimeForm.control}
                  render={({ field }) => (
                    <TextField
                      name={field.name}
                      value={field.value || 4}
                      onBlur={field.onBlur}
                      label="Thread Count"
                      type="number"
                      fullWidth
                      helperText="Number of threads for parallel processing"
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
                  name="enableOptimizer"
                  control={runtimeForm.control}
                  render={({ field }) => (
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={field.value || false}
                          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                            field.onChange(e.target.checked)
                          }
                        />
                      }
                      label="Enable Query Optimizer (Recommended)"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="tempDirectory"
                  control={runtimeForm.control}
                  render={({ field }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Temporary Directory (Optional)"
                      fullWidth
                      helperText="Directory for temporary files during processing"
                      placeholder="/tmp/ducklake"
                    />
                  )}
                />
              </Grid>
            </Grid>

            <Alert severity="info" sx={{ mt: 3 }}>
              <Typography variant="body2">
                These settings can be modified later in the instance
                configuration.
              </Typography>
            </Alert>
          </Box>
        );

      case 3:
        return (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6" gutterBottom>
              Review & Create
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Review your configuration and create the DuckLake instance.
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Info color="primary" />
                    Instance Details
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Name"
                        secondary={wizardData.basics?.name}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Data Path"
                        secondary={wizardData.basics?.dataPath}
                      />
                    </ListItem>
                    {wizardData.basics?.description && (
                      <ListItem>
                        <ListItemText
                          primary="Description"
                          secondary={wizardData.basics.description}
                        />
                      </ListItem>
                    )}
                  </List>
                </Paper>
              </Grid>

              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2 }}>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Database color="primary" />
                    Catalog Configuration
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Type"
                        secondary={
                          <Chip
                            label={
                              catalogTypeInfo[
                                wizardData.catalog
                                  ?.type as keyof typeof catalogTypeInfo
                              ]?.title
                            }
                            size="small"
                            color="primary"
                          />
                        }
                      />
                    </ListItem>
                    {wizardData.catalog?.type === 'postgresql' && (
                      <>
                        <ListItem>
                          <ListItemText
                            primary="Connection"
                            secondary={`${wizardData.catalog.postgresql?.host}:${wizardData.catalog.postgresql?.port}/${wizardData.catalog.postgresql?.database}`}
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="SSL"
                            secondary={
                              wizardData.catalog.postgresql?.ssl
                                ? 'Enabled'
                                : 'Disabled'
                            }
                          />
                        </ListItem>
                      </>
                    )}
                  </List>
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 2 }}>
                  <Typography
                    variant="subtitle1"
                    gutterBottom
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Settings color="primary" />
                    Runtime Options
                  </Typography>
                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Max Memory"
                        secondary={wizardData.runtime?.maxMemory}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Threads"
                        secondary={wizardData.runtime?.threads}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Query Optimizer"
                        secondary={
                          wizardData.runtime?.enableOptimizer
                            ? 'Enabled'
                            : 'Disabled'
                        }
                      />
                    </ListItem>
                  </List>
                </Paper>
              </Grid>
            </Grid>

            <Alert severity="success" sx={{ mt: 3 }}>
              <Typography variant="body2">
                Ready to create your DuckLake instance! This will set up the
                catalog connection and initialize the data directory.
              </Typography>
            </Alert>
          </Box>
        );

      default:
        return null;
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      <Typography
        variant="h4"
        component="h1"
        sx={{ fontWeight: 'bold', mb: 3 }}
      >
        Create DuckLake Instance
      </Typography>

      <Card sx={{ maxWidth: 800, mx: 'auto' }}>
        <CardContent sx={{ p: 3 }}>
          <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
            {steps.map((label) => (
              <Step key={label}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {renderStepContent()}

          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 4 }}>
            <Button
              onClick={handleCancel}
              disabled={isLoading}
              startIcon={<Close />}
              variant="outlined"
            >
              Cancel
            </Button>

            <Box sx={{ display: 'flex', gap: 1 }}>
              {activeStep > 0 && (
                <Button
                  onClick={handleBack}
                  disabled={isLoading}
                  startIcon={<ArrowBack />}
                  variant="outlined"
                >
                  Back
                </Button>
              )}
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={isLoading}
                startIcon={isFinalStep ? <CheckCircle /> : <ArrowForward />}
              >
                {nextButtonLabel}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
