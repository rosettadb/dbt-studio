import React, { useState, useEffect, useMemo } from 'react';
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
  IconButton,
  CircularProgress,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  Dataset as Database,
  Settings,
  CheckCircle,
  Info,
  Folder,
  ArrowForward,
  ArrowBack,
  Close,
  FolderOpen,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import connectionIcons, {
  cloudStorageImages,
} from '../../../../assets/connectionIcons';
import sqliteIcon from '../../../../assets/connectionIcons/sqlite.png';
import { DuckLakeService } from '../../services/duckLake.service';
import { useFilePicker } from '../../controllers';
import { DataLakeConnectionSelector } from './DataLakeConnectionSelector';

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
  description: z.string().optional(),
  dataPath: z.string().optional(), // Computed from storage config
});

const storageConfigSchema = z
  .object({
    type: z.enum(['local', 's3', 'azure', 'gcs']),

    // Cloud Explorer connection integration
    connectionId: z.string().optional(),
    bucket: z.string().optional(), // For cloud storage with connectionId
    prefix: z.string().optional(), // For cloud storage with connectionId

    local: z
      .object({
        path: z.string().min(1, 'Local path is required'),
      })
      .optional(),
    s3: z
      .object({
        bucket: z.string().min(1, 'Bucket is required'),
        region: z.string().min(1, 'Region is required'),
        accessKeyId: z.string().min(1, 'Access Key ID is required'),
        secretAccessKey: z.string().min(1, 'Secret Access Key is required'),
        endpoint: z.string().optional(),
        prefix: z.string().optional(),
      })
      .optional(),
    azure: z
      .object({
        container: z.string().min(1, 'Container is required'),
        accountName: z.string().min(1, 'Account Name is required'),
        accountKey: z.string().min(1, 'Account Key is required'),
        connectionString: z.string().optional(),
        prefix: z.string().optional(),
      })
      .optional(),
    gcs: z
      .object({
        bucket: z.string().min(1, 'Bucket is required'),
        projectId: z.string().min(1, 'Project ID is required'),
        credentials: z
          .string()
          .min(1, 'Service account credentials are required'),
        prefix: z.string().optional(),
      })
      .optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'local') return !!data.local?.path;

      // If using connectionId, only bucket is required
      if (data.connectionId) {
        return !!data.bucket;
      }

      // Otherwise, validate inline configs
      if (data.type === 's3')
        return (
          !!data.s3?.bucket &&
          !!data.s3?.region &&
          !!data.s3?.accessKeyId &&
          !!data.s3?.secretAccessKey
        );
      if (data.type === 'azure')
        return (
          !!data.azure?.container &&
          !!data.azure?.accountName &&
          !!data.azure?.accountKey
        );
      if (data.type === 'gcs')
        return (
          !!data.gcs?.bucket && !!data.gcs?.projectId && !!data.gcs?.credentials
        );
      return false;
    },
    {
      message: 'Please fill in all required storage configuration fields',
      path: ['type'],
    },
  );

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
type StorageConfig = z.infer<typeof storageConfigSchema>;
type CatalogConfig = z.infer<typeof catalogConfigSchema>;
type RuntimeOptions = z.infer<typeof runtimeOptionsSchema>;

interface WizardData {
  basics: InstanceBasics;
  storage: StorageConfig;
  catalog: CatalogConfig;
  runtime: RuntimeOptions;
}

const steps = [
  'Instance Details',
  'Storage Configuration',
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
    disabled: true,
  },
  postgresql: {
    title: 'PostgreSQL',
    description: 'Multi-user, remote-access lakehouse',
    pros: ['Full concurrency', 'Remote access', 'ACID transactions'],
    cons: ['Requires PostgreSQL server', 'More complex setup'],
    recommended: 'Production multi-user environments',
    disabled: true,
  },
};

interface DuckLakeConnectionWizardProps {
  onComplete?: (data: WizardData) => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

// Get default temp directory based on OS
const getDefaultTempDirectory = (): string => {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) {
    return 'C:\\temp\\ducklake';
  }
  // macOS and Linux
  return '/tmp/ducklake';
};

export const DataLakeConnectionWizard: React.FC<
  DuckLakeConnectionWizardProps
> = ({ onComplete, onCancel, isLoading = false }) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const [activeStep, setActiveStep] = useState(0);
  const [wizardData, setWizardData] = useState<Partial<WizardData>>({});
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isTestingStorage, setIsTestingStorage] = useState(false);
  const [storageConnectionStatus, setStorageConnectionStatus] = useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [isTestingCatalog, setIsTestingCatalog] = useState(false);
  const [catalogConnectionStatus, setCatalogConnectionStatus] = useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [showPassword, setShowPassword] = useState(false);

  const isFinalStep = activeStep === steps.length - 1;
  const nextButtonLabel = getNextButtonLabel(
    isLoading || validating,
    isFinalStep,
  );

  // Form for current step
  const basicsForm = useForm<InstanceBasics>({
    resolver: zodResolver(instanceBasicsSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.basics || {
      name: '',
      description: '',
    },
  });

  const storageForm = useForm<StorageConfig>({
    resolver: zodResolver(storageConfigSchema),
    mode: 'onChange',
    defaultValues: wizardData.storage || {
      type: 'local',
    },
  });

  const catalogForm = useForm<CatalogConfig>({
    resolver: zodResolver(catalogConfigSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.catalog || {
      type: 'duckdb',
      postgresql: {
        port: 5432,
        ssl: false,
      },
    },
  });

  const runtimeForm = useForm<RuntimeOptions>({
    resolver: zodResolver(runtimeOptionsSchema),
    mode: 'onChange', // Validate on change
    defaultValues: wizardData.runtime || {
      maxMemory: '4GB',
      threads: 4,
      enableOptimizer: true,
      tempDirectory: getDefaultTempDirectory(),
    },
  });

  // Reset form errors when step changes
  useEffect(() => {
    basicsForm.clearErrors();
    storageForm.clearErrors();
    catalogForm.clearErrors();
    runtimeForm.clearErrors();
    setValidationError(null);
  }, [activeStep, basicsForm, storageForm, catalogForm, runtimeForm]);

  const { mutate: getFiles } = useFilePicker();

  const handleLocalPathSelect = () => {
    getFiles(
      {
        properties: ['openDirectory'],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            storageForm.setValue('local.path', filePaths[0], {
              shouldValidate: true,
              shouldDirty: true,
            });
          }
        },
      },
    );
  };

  const normalizeStorageConfig = (storage: StorageConfig): StorageConfig => {
    if (storage.connectionId) {
      const base = {
        ...storage,
        bucket: storage.bucket?.trim(),
        prefix: storage.prefix?.trim() || undefined,
      };

      if (storage.type === 's3') {
        base.s3 = {
          bucket: base.bucket || '',
          prefix: base.prefix,
        } as StorageConfig['s3'];
      }

      if (storage.type === 'azure') {
        base.azure = {
          container: base.bucket || '',
          prefix: base.prefix,
        } as StorageConfig['azure'];
      }

      if (storage.type === 'gcs') {
        base.gcs = {
          bucket: base.bucket || '',
          prefix: base.prefix,
        } as StorageConfig['gcs'];
      }

      return base;
    }

    return storage;
  };

  const buildDataPathFromStorage = (storage: StorageConfig | undefined) => {
    if (!storage) {
      return '';
    }

    const bucketOrContainer =
      storage.bucket ||
      storage.s3?.bucket ||
      storage.azure?.container ||
      storage.gcs?.bucket;
    const prefix =
      storage.prefix ||
      storage.s3?.prefix ||
      storage.azure?.prefix ||
      storage.gcs?.prefix;

    switch (storage.type) {
      case 'local':
        return storage.local?.path || '';
      case 's3':
        return `s3://${bucketOrContainer || ''}${prefix ? `/${prefix}` : ''}`;
      case 'azure':
        return `abfss://${bucketOrContainer || ''}${prefix ? `/${prefix}` : ''}`;
      case 'gcs':
        return `gs://${bucketOrContainer || ''}${prefix ? `/${prefix}` : ''}`;
      default:
        return '';
    }
  };

  const handleCatalogPathSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
        filters: [{ name: 'DuckDB Database', extensions: ['duckdb', 'db'] }],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            catalogForm.setValue('duckdb.metadataPath', filePaths[0], {
              shouldValidate: true,
              shouldDirty: true,
            });
          }
        },
      },
    );
  };

  const handleMetadataPathSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
        filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            catalogForm.setValue('sqlite.metadataPath', filePaths[0], {
              shouldValidate: true,
              shouldDirty: true,
            });
          }
        },
      },
    );
  };

  const handleTempDirectorySelect = () => {
    getFiles(
      {
        properties: ['openDirectory'],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            runtimeForm.setValue('tempDirectory', filePaths[0], {
              shouldValidate: true,
              shouldDirty: true,
            });
          }
        },
      },
    );
  };

  const handleTestStorage = async () => {
    const isValid = await storageForm.trigger();
    if (!isValid) {
      return;
    }

    setIsTestingStorage(true);
    setStorageConnectionStatus('idle');
    setValidationError(null);

    try {
      const data = storageForm.getValues();
      const result = await DuckLakeService.validateStorageConnection(data);
      if (result.success) {
        setStorageConnectionStatus('success');
      } else {
        setStorageConnectionStatus('failed');
        setValidationError(result.error || 'Connection test failed');
      }
    } catch (error) {
      setStorageConnectionStatus('failed');
      setValidationError((error as Error).message);
    } finally {
      setIsTestingStorage(false);
    }
  };

  const handleTestCatalog = async () => {
    const isValid = await catalogForm.trigger();
    if (!isValid) {
      return;
    }

    setIsTestingCatalog(true);
    setCatalogConnectionStatus('idle');
    setValidationError(null);

    try {
      const data = catalogForm.getValues();
      const result = await DuckLakeService.testCatalogConnection(data);
      if (result.success) {
        setCatalogConnectionStatus('success');
      } else {
        setCatalogConnectionStatus('failed');
        setValidationError(result.error || 'Connection test failed');
      }
    } catch (error) {
      setCatalogConnectionStatus('failed');
      setValidationError((error as Error).message);
    } finally {
      setIsTestingCatalog(false);
    }
  };

  const getIndicatorColor = (status: 'idle' | 'success' | 'failed') => {
    switch (status) {
      case 'success':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return '#9e9e9e';
    }
  };

  const getButtonStartIcon = (isTesting: boolean) => {
    if (isTesting) {
      return <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />;
    }
    return null;
  };

  // Generate PostgreSQL database URL
  const pgHost = catalogForm.watch('postgresql.host');
  const pgPort = catalogForm.watch('postgresql.port');
  const pgDatabase = catalogForm.watch('postgresql.database');
  const pgUsername = catalogForm.watch('postgresql.username');
  const pgPassword = catalogForm.watch('postgresql.password');
  const pgSsl = catalogForm.watch('postgresql.ssl');

  const postgresqlDatabaseUrl = useMemo(() => {
    // Only generate URL if we have the minimum required fields
    if (!pgHost || !pgDatabase || !pgUsername) return '';

    // Mask password with asterisks for display
    const maskedPassword = pgPassword ? '****' : '';
    const encodedUsername = encodeURIComponent(pgUsername);
    const encodedDatabase = encodeURIComponent(pgDatabase);
    const sslMode = pgSsl ? '?sslmode=require' : '';

    return `postgresql://${encodedUsername}:${maskedPassword}@${pgHost}:${pgPort || 5432}/${encodedDatabase}${sslMode}`;
  }, [pgHost, pgPort, pgDatabase, pgUsername, pgPassword, pgSsl]);

  const selectedStorageType = storageForm.watch('type');
  const selectedCatalogType = catalogForm.watch('type');

  // Clear other storage type fields when storage type changes
  useEffect(() => {
    if (!selectedStorageType) {
      return;
    }

    // Reset connection test status when storage type changes
    setStorageConnectionStatus('idle');

    const clearStorageFields = (
      fields: ('local' | 's3' | 'azure' | 'gcs')[],
    ) => {
      fields.forEach((field) => {
        storageForm.setValue(field, undefined, {
          shouldValidate: false,
          shouldDirty: false,
        });
      });
      storageForm.clearErrors(fields);
    };

    if (selectedStorageType === 'local') {
      clearStorageFields(['s3', 'azure', 'gcs']);
      return;
    }

    if (selectedStorageType === 's3') {
      clearStorageFields(['local', 'azure', 'gcs']);
      return;
    }

    if (selectedStorageType === 'azure') {
      clearStorageFields(['local', 's3', 'gcs']);
      return;
    }

    if (selectedStorageType === 'gcs') {
      clearStorageFields(['local', 's3', 'azure']);
    }
  }, [storageForm, selectedStorageType]);

  useEffect(() => {
    if (!selectedCatalogType) {
      return;
    }

    // Reset catalog connection test status when catalog type changes
    setCatalogConnectionStatus('idle');

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
        } else {
          setValidationError('Please fix the errors in the form');
        }
        break;
      }
      case 1: {
        isValid = await storageForm.trigger();
        if (isValid) {
          const data = storageForm.getValues();
          const normalizedStorage = normalizeStorageConfig(data);
          setValidating(true);
          setValidationError(null);
          try {
            const result =
              await DuckLakeService.validateStorageConnection(
                normalizedStorage,
              );
            if (result.success) {
              setWizardData((prev) => ({
                ...prev,
                storage: normalizedStorage,
              }));

              // Pre-populate DuckDB metadata path if empty
              const currentMetadataPath = catalogForm.getValues(
                'duckdb.metadataPath',
              );
              if (!currentMetadataPath) {
                const instanceName = basicsForm.getValues('name');
                if (instanceName) {
                  // Sanitize instance name for filename
                  const safeName = instanceName
                    .toLowerCase()
                    .replace(/[^a-z0-9]/g, '_');
                  const defaultPath = `/tmp/ducklake/${safeName}.duckdb`;
                  catalogForm.setValue('duckdb.metadataPath', defaultPath);
                }
              }
            } else {
              isValid = false;
              setValidationError(result.error || 'Connection failed');
            }
          } catch (error) {
            isValid = false;
            setValidationError((error as Error).message);
          } finally {
            setValidating(false);
          }
        }
        break;
      }
      case 2: {
        isValid = await catalogForm.trigger();
        if (isValid) {
          const data = catalogForm.getValues();
          setWizardData((prev) => ({ ...prev, catalog: data }));
        } else {
          setValidationError('Please fix the errors in the form');
        }
        break;
      }
      case 3: {
        isValid = await runtimeForm.trigger();
        if (isValid) {
          const data = runtimeForm.getValues();
          setWizardData((prev) => ({ ...prev, runtime: data }));
        } else {
          setValidationError('Please fix the errors in the form');
        }
        break;
      }
      case 4: {
        // Final step - create instance
        if (
          onComplete &&
          wizardData.basics &&
          wizardData.storage &&
          wizardData.catalog &&
          wizardData.runtime
        ) {
          // Clean up empty optional fields
          const cleanedRuntime = {
            ...wizardData.runtime,
            maxMemory: wizardData.runtime.maxMemory || undefined,
            tempDirectory: wizardData.runtime.tempDirectory || undefined,
          };

          // Construct dataPath from storage config for DuckLake ATTACH command
          const dataPath = buildDataPathFromStorage(wizardData.storage);

          onComplete({
            basics: {
              ...wizardData.basics,
              dataPath, // Include computed dataPath for DuckLake ATTACH
            },
            storage: wizardData.storage,
            catalog: wizardData.catalog,
            runtime: cleanedRuntime,
          });
        } else {
          setValidationError('Please fix the errors in the form');
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
      navigate('/app/data-lake/duck-lake/instances');
    }
  };

  const getStorageLocation = () => {
    if (!wizardData.storage) return '';

    const { type } = wizardData.storage;

    if (type === 'local') {
      return wizardData.storage.local?.path || '';
    }
    if (type === 's3') {
      return `s3://${wizardData.storage.s3?.bucket || ''}`;
    }
    if (type === 'azure') {
      return `abfss://${wizardData.storage.azure?.container || ''}`;
    }
    if (type === 'gcs') {
      return `gs://${wizardData.storage.gcs?.bucket || ''}`;
    }

    return '';
  };

  const getStorageTypeLabel = () => {
    if (!wizardData.storage) return '';

    const { type } = wizardData.storage;

    if (type === 'gcs') {
      return 'Google Cloud Storage';
    }
    if (type === 's3') {
      return 'Amazon S3';
    }
    if (type === 'azure') {
      return 'Azure Blob Storage';
    }
    if (type === 'local') {
      return 'Local Filesystem';
    }

    return '';
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
              Storage Configuration
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Choose where DuckLake will store your data files (Parquet).
            </Typography>

            {validationError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {validationError}
              </Alert>
            )}

            <Controller
              name="type"
              control={storageForm.control}
              render={({ field }) => (
                <FormControl component="fieldset" fullWidth>
                  <FormLabel component="legend">Storage Type</FormLabel>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    {['local', 's3', 'azure', 'gcs'].map((type) => (
                      <Grid item xs={6} sm={3} key={type}>
                        <Card
                          variant={
                            field.value === type ? 'elevation' : 'outlined'
                          }
                          sx={{
                            cursor: 'pointer',
                            border:
                              field.value === type ? '2px solid' : '1px solid',
                            borderColor:
                              field.value === type ? 'primary.main' : 'divider',
                            height: '100px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                          onClick={() => field.onChange(type)}
                        >
                          <Box
                            sx={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            {type === 'local' ? (
                              <Folder fontSize="large" color="action" />
                            ) : (
                              <Box
                                component="img"
                                src={
                                  cloudStorageImages[
                                    type as keyof typeof cloudStorageImages
                                  ]
                                }
                                sx={{
                                  width: 40,
                                  height: 40,
                                  objectFit: 'contain',
                                }}
                              />
                            )}
                            <Typography
                              variant="body2"
                              sx={{ textTransform: 'capitalize' }}
                            >
                              {type === 'gcs' ? 'Google Cloud' : type}
                            </Typography>
                          </Box>
                        </Card>
                      </Grid>
                    ))}
                  </Grid>
                </FormControl>
              )}
            />

            <Box sx={{ mt: 3 }}>
              {storageForm.watch('type') === 'local' && (
                <Controller
                  name="local.path"
                  control={storageForm.control}
                  render={({ field, fieldState }) => (
                    <TextField
                      name={field.name}
                      value={field.value || ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      label="Local Data Path"
                      fullWidth
                      error={!!fieldState.error}
                      helperText={
                        fieldState.error?.message ||
                        'Absolute path to local directory'
                      }
                      placeholder="/path/to/data"
                      InputProps={{
                        endAdornment: (
                          <IconButton
                            onClick={handleLocalPathSelect}
                            edge="end"
                          >
                            <FolderOpen />
                          </IconButton>
                        ),
                      }}
                    />
                  )}
                />
              )}

              {/* Cloud storage - show connection selector */}
              {['s3', 'azure', 'gcs'].includes(storageForm.watch('type')) && (
                <DataLakeConnectionSelector
                  selectedProvider={
                    // Map storage type to provider: s3 -> aws, others stay the same
                    (storageForm.watch('type') === 's3'
                      ? 'aws'
                      : storageForm.watch('type')) as 'aws' | 'azure' | 'gcs'
                  }
                  initialConnectionId={storageForm.watch('connectionId')}
                  initialBucket={storageForm.watch('bucket')}
                  initialPrefix={storageForm.watch('prefix')}
                  onSelectExisting={(connectionId, bucket, prefix) => {
                    storageForm.setValue('connectionId', connectionId);
                    storageForm.setValue('bucket', bucket);
                    storageForm.setValue('prefix', prefix);
                  }}
                />
              )}
            </Box>

            {/* Test Storage Connection Button */}
            {selectedStorageType && selectedStorageType !== 'local' && (
              <Box
                sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}
              >
                <Button
                  type="button"
                  variant="contained"
                  color="primary"
                  onClick={handleTestStorage}
                  disabled={isTestingStorage}
                  sx={{
                    position: 'relative',
                    paddingRight: '32px',
                    minWidth: '150px',
                  }}
                  startIcon={getButtonStartIcon(isTestingStorage)}
                >
                  {isTestingStorage ? 'Testing...' : 'Test Connection'}
                  <Box
                    sx={{
                      position: 'absolute',
                      right: 10,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: getIndicatorColor(
                        storageConnectionStatus,
                      ),
                      border: `1px solid ${theme.palette.primary.contrastText}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  />
                </Button>
              </Box>
            )}
          </Box>
        );

      case 2:
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
                        <Tooltip
                          title={
                            (info as any).disabled
                              ? 'This catalog type will be available in a future release'
                              : ''
                          }
                        >
                          <Box>
                            <Card
                              variant={
                                field.value === type ? 'elevation' : 'outlined'
                              }
                              sx={{
                                cursor: (info as any).disabled
                                  ? 'not-allowed'
                                  : 'pointer',
                                transition: 'all 0.2s',
                                height: '140px',
                                border:
                                  field.value === type
                                    ? '2px solid'
                                    : '1px solid',
                                borderColor:
                                  field.value === type
                                    ? 'primary.main'
                                    : 'divider',
                                opacity: (info as any).disabled ? 0.6 : 1,
                                position: 'relative',
                                overflow: 'hidden',
                                '&:hover': {
                                  elevation: (info as any).disabled ? 0 : 4,
                                  borderColor: (info as any).disabled
                                    ? 'divider'
                                    : 'primary.main',
                                },
                              }}
                              onClick={() => {
                                if (!(info as any).disabled) {
                                  field.onChange(type);
                                }
                              }}
                            >
                              {(info as any).disabled && (
                                <Box
                                  sx={{
                                    position: 'absolute',
                                    top: 12,
                                    right: -32,
                                    transform: 'rotate(45deg)',
                                    backgroundColor: 'primary.main',
                                    color: 'primary.contrastText',
                                    width: '100px',
                                    textAlign: 'center',
                                    py: 0.5,
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    boxShadow: 2,
                                    zIndex: 1,
                                  }}
                                >
                                  Soon
                                </Box>
                              )}
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
                          </Box>
                        </Tooltip>
                      </Grid>
                    ))}
                  </Grid>

                  {/* Show selected catalog details */}
                  {/* {field.value && (
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
                  )} */}
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
                        endAdornment: (
                          <IconButton
                            onClick={handleCatalogPathSelect}
                            edge="end"
                          >
                            <FolderOpen />
                          </IconButton>
                        ),
                      }}
                    />
                  )}
                />

                {/* Test Connection Button */}
                <Box
                  sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}
                >
                  <Button
                    type="button"
                    variant="contained"
                    color="primary"
                    onClick={handleTestCatalog}
                    disabled={isTestingCatalog || !selectedCatalogType}
                    sx={{
                      position: 'relative',
                      paddingRight: '32px',
                      minWidth: '150px',
                    }}
                    startIcon={getButtonStartIcon(isTestingCatalog)}
                  >
                    {isTestingCatalog ? 'Testing...' : 'Test Connection'}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: getIndicatorColor(
                          catalogConnectionStatus,
                        ),
                        border: `1px solid ${theme.palette.primary.contrastText}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Button>
                </Box>
              </Box>
            )}

            {catalogForm.watch('type') === 'sqlite' && (
              <Box sx={{ mt: 3 }}>
                <Typography variant="subtitle2" gutterBottom>
                  SQLite Configuration
                </Typography>
                <Alert severity="info" sx={{ mb: 2 }}>
                  <Typography variant="body2" gutterBottom>
                    SQLite will store catalog metadata in a database file. The
                    file must have a .db or .sqlite extension.
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    To create a new SQLite database, run:{' '}
                    <code
                      style={{
                        backgroundColor: 'rgba(0, 0, 0, 0.1)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontFamily: 'monospace',
                      }}
                    >
                      sqlite3 mydatabase.sqlite &quot;VACUUM;&quot;
                    </code>
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
                        endAdornment: (
                          <IconButton
                            onClick={handleMetadataPathSelect}
                            edge="end"
                          >
                            <FolderOpen />
                          </IconButton>
                        ),
                      }}
                    />
                  )}
                />

                {/* Test Connection Button */}
                <Box
                  sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}
                >
                  <Button
                    type="button"
                    variant="contained"
                    color="primary"
                    onClick={handleTestCatalog}
                    disabled={isTestingCatalog}
                    sx={{
                      position: 'relative',
                      paddingRight: '32px',
                      minWidth: '150px',
                    }}
                    startIcon={getButtonStartIcon(isTestingCatalog)}
                  >
                    {isTestingCatalog ? 'Testing...' : 'Test Connection'}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: getIndicatorColor(
                          catalogConnectionStatus,
                        ),
                        border: `1px solid ${theme.palette.primary.contrastText}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Button>
                </Box>
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
                          value={field.value ?? 5432}
                          onBlur={field.onBlur}
                          label="Port"
                          type="number"
                          fullWidth
                          error={!!fieldState.error}
                          helperText={fieldState.error?.message}
                          placeholder="5432"
                          onChange={(e) => {
                            const value = parseInt(e.target.value, 10);
                            field.onChange(Number.isNaN(value) ? 5432 : value);
                          }}
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
                            endAdornment: (
                              <IconButton
                                onClick={() => setShowPassword(!showPassword)}
                                edge="end"
                              >
                                {showPassword ? (
                                  <VisibilityOff />
                                ) : (
                                  <Visibility />
                                )}
                              </IconButton>
                            ),
                            type: showPassword ? 'text' : 'password',
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
                  {postgresqlDatabaseUrl && (
                    <Grid item xs={12}>
                      <Box
                        sx={{
                          p: 2,
                          backgroundColor: 'rgba(0, 0, 0, 0.05)',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'divider',
                        }}
                      >
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            wordBreak: 'break-all',
                            color: 'text.primary',
                          }}
                        >
                          {postgresqlDatabaseUrl}
                        </Typography>
                      </Box>
                    </Grid>
                  )}
                </Grid>

                {/* Test Connection Button */}
                <Box
                  sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}
                >
                  <Button
                    type="button"
                    variant="contained"
                    color="primary"
                    onClick={handleTestCatalog}
                    disabled={isTestingCatalog}
                    sx={{
                      position: 'relative',
                      paddingRight: '32px',
                      minWidth: '150px',
                    }}
                    startIcon={getButtonStartIcon(isTestingCatalog)}
                  >
                    {isTestingCatalog ? 'Testing...' : 'Test Connection'}
                    <Box
                      sx={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: getIndicatorColor(
                          catalogConnectionStatus,
                        ),
                        border: `1px solid ${theme.palette.primary.contrastText}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    />
                  </Button>
                </Box>
              </Box>
            )}
          </Box>
        );

      case 3:
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
                      InputProps={{
                        endAdornment: (
                          <IconButton
                            onClick={handleTempDirectorySelect}
                            edge="end"
                          >
                            <FolderOpen />
                          </IconButton>
                        ),
                      }}
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

      case 4:
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
                        primary="Storage Type"
                        secondary={getStorageTypeLabel()}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Location"
                        secondary={getStorageLocation()}
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
