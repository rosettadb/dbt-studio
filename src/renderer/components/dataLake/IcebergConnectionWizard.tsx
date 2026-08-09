/**
 * Iceberg Connection Wizard
 * 4-step wizard for creating/editing Apache Iceberg instances.
 * Pattern: mirrors DataLakeConnectionWizard structure (DuckLake).
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Stepper,
  Step,
  StepLabel,
  FormControl,
  InputAdornment,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  Chip,
  CircularProgress,
  Paper,
  Divider,
  IconButton,
  Tooltip,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import {
  ArrowForward,
  ArrowBack,
  CheckCircle,
  FolderOpen,
  Speed,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { IcebergIcon } from './iceberg/IcebergIcon';
import type {
  IcebergCatalogType,
  IcebergCloudProvider,
  IcebergInstanceConfig,
  IcebergStorageType,
} from '../../../types/iceberg';
import { useFilePicker, useGetConnections } from '../../controllers';
import {
  useCreateIcebergMetadataFile,
  useIcebergCapabilities,
  useTestIcebergCatalog,
} from '../../controllers/icebergDatalake.controller';
import { DataLakeConnectionSelector } from './DataLakeConnectionSelector';

// ─── Wizard Data ─────────────────────────────────────────────────────────────

export interface IcebergWizardData {
  basics: {
    name: string;
    description?: string;
  };
  catalog: {
    catalogType: IcebergCatalogType;
    catalogPath?: string;
    endpoint?: string;
    catalogName?: string;
    databaseConnectionId?: string;
    authMode?: 'none' | 'token' | 'oauth-client-credentials';
    accessToken?: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
    oauthServerUri?: string;
    oauthScope?: string;
    polarisConnectionId?: string;
    polarisBucket?: string;
    polarisPrefix?: string;
  };
  storage: {
    storageType: IcebergStorageType;
    localPath?: string;
    cloudProvider?: IcebergCloudProvider;
    connectionId?: string;
    bucket?: string;
    prefix?: string;
  };
}

export interface IcebergConnectionWizardProps {
  onComplete: (data: IcebergWizardData) => void | Promise<void>;
  onCancel: () => void;
  isLoading?: boolean;
  /** Pre-fill the form from an existing instance (edit mode) */
  initialData?: IcebergInstanceConfig;
  mode?: 'create' | 'edit';
}

// ─── Step labels ─────────────────────────────────────────────────────────────

const STEPS = ['Basics', 'Catalog', 'Storage', 'Review'];

// ─── Default empty state ─────────────────────────────────────────────────────

const emptyData = (): IcebergWizardData => ({
  basics: { name: '', description: '' },
  catalog: { catalogType: 'sqlite' },
  storage: { storageType: 'local' },
});

function buildInitialData(initial?: IcebergInstanceConfig): IcebergWizardData {
  if (!initial) return emptyData();
  return {
    basics: {
      name: initial.name,
      description: initial.description ?? '',
    },
    catalog: {
      catalogType: initial.catalogType,
      catalogPath: initial.catalogPath,
      endpoint: initial.endpoint,
      catalogName: initial.catalogName,
      databaseConnectionId: initial.databaseConnectionId,
      authMode: initial.catalogAuthMode ?? 'none',
      // Token is masked — never pre-filled; placeholder shown instead
      accessToken: undefined,
      oauthClientId: initial.oauthClientId,
      oauthClientSecret: undefined,
      oauthServerUri: initial.oauthServerUri,
      oauthScope: initial.oauthScope,
      polarisConnectionId: initial.catalogConnectionId,
      polarisBucket: initial.catalogBucket,
      polarisPrefix: initial.catalogPrefix,
    },
    storage: {
      storageType:
        initial.catalogType === 'rest' || initial.catalogType === 'polaris'
          ? 'server-managed'
          : initial.storageType,
      localPath: initial.localPath,
      cloudProvider: initial.cloudProvider,
      connectionId: initial.storageConnectionId,
      bucket: initial.storageBucket,
      prefix: initial.storagePrefix,
    },
  };
}

// ─── Validation helpers ───────────────────────────────────────────────────────

function validateStep(
  step: number,
  data: IcebergWizardData,
  hasExistingOAuthSecret = false,
): string | null {
  if (step === 0) {
    if (!data.basics.name.trim()) return 'Instance name is required.';
    if (data.basics.name.trim().length > 80)
      return 'Instance name must be 80 characters or fewer.';
  }
  if (step === 1) {
    if (data.catalog.catalogType === 'sqlite' && !data.catalog.catalogPath) {
      return 'Catalog database path is required for SQLite.';
    }
    if (
      data.catalog.catalogType === 'sql' &&
      !data.catalog.databaseConnectionId
    ) {
      return 'A PostgreSQL or Neon connection is required.';
    }
    if (data.catalog.catalogType === 'sql' && !data.catalog.catalogName) {
      return 'SQL catalog name is required.';
    }
    if (
      data.catalog.catalogType === 'rest' ||
      data.catalog.catalogType === 'polaris'
    ) {
      if (!data.catalog.endpoint) return 'REST endpoint is required.';
      if (!data.catalog.catalogName)
        return 'Catalog name / warehouse is required.';
      if (
        data.catalog.authMode === 'oauth-client-credentials' &&
        !data.catalog.oauthClientId
      ) {
        return 'OAuth Client ID is required.';
      }
      if (
        data.catalog.authMode === 'oauth-client-credentials' &&
        !data.catalog.oauthClientSecret &&
        !hasExistingOAuthSecret
      ) {
        return 'OAuth Client Secret is required.';
      }
      if (
        data.catalog.authMode === 'oauth-client-credentials' &&
        !data.catalog.oauthServerUri
      ) {
        return 'OAuth Token Endpoint is required.';
      }
    }
  }
  if (step === 2) {
    if (
      data.catalog.catalogType === 'rest' ||
      data.catalog.catalogType === 'polaris'
    ) {
      // REST catalogs manage warehouse storage server-side; vended creds optional
      return null;
    }
    if (data.storage.storageType === 'local' && !data.storage.localPath) {
      return 'Local storage path is required.';
    }
    if (data.storage.storageType === 'cloud') {
      if (!data.storage.connectionId)
        return 'A cloud connection must be selected.';
      if (!data.storage.bucket) return 'Bucket name is required.';
    }
  }
  return null;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const IcebergConnectionWizard: React.FC<
  IcebergConnectionWizardProps
> = ({
  onComplete,
  onCancel,
  isLoading = false,
  initialData,
  mode = 'create',
}) => {
  const [activeStep, setActiveStep] = useState(0);
  const [data, setData] = useState<IcebergWizardData>(() =>
    buildInitialData(initialData),
  );
  const [stepError, setStepError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [catalogTestResult, setCatalogTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (initialData) {
      setData(buildInitialData(initialData));
      setActiveStep(0);
      setStepError(null);
      setCatalogTestResult(null);
    }
  }, [initialData]);

  // Catalog test
  const testCatalogMutation = useTestIcebergCatalog();
  const createLocalCatalogMutation = useCreateIcebergMetadataFile();
  const capabilitiesQuery = useIcebergCapabilities();
  const catalogCapabilities = capabilitiesQuery.data?.catalogs ?? [];
  const databaseConnectionsQuery = useGetConnections();
  const postgresConnections = (databaseConnectionsQuery.data ?? []).filter(
    (connection) => connection.connection.type === 'postgres',
  );

  const { mutate: getFiles } = useFilePicker();

  const pickFolder = (setter: (path: string) => void) => {
    getFiles(
      { properties: ['openDirectory'] },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            setter(filePaths[0]);
          }
        },
      },
    );
  };

  // ── Step navigation ─────────────────────────────────────────────────────

  const handleNext = () => {
    const err = validateStep(
      activeStep,
      data,
      mode === 'edit' && !!initialData?.oauthClientSecretKey,
    );
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setCatalogTestResult(null);
    setActiveStep((s) => s + 1);
  };

  const handleBack = () => {
    setStepError(null);
    setCatalogTestResult(null);
    setActiveStep((s) => s - 1);
  };

  const handleFinish = async () => {
    const err = validateStep(
      3,
      data,
      mode === 'edit' && !!initialData?.oauthClientSecretKey,
    );
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    await onComplete(data);
  };

  // ── Partial update helpers ──────────────────────────────────────────────

  const patchBasics = (patch: Partial<IcebergWizardData['basics']>) =>
    setData((d) => ({ ...d, basics: { ...d.basics, ...patch } }));

  const patchCatalog = (patch: Partial<IcebergWizardData['catalog']>) =>
    setData((d) => ({ ...d, catalog: { ...d.catalog, ...patch } }));

  const patchStorage = (patch: Partial<IcebergWizardData['storage']>) =>
    setData((d) => ({ ...d, storage: { ...d.storage, ...patch } }));

  const initializeLocalCatalog = (catalogDirectory: string) => {
    setStepError(null);
    createLocalCatalogMutation.mutate(catalogDirectory, {
      onSuccess: (result) => {
        patchCatalog({ catalogPath: result.catalogPath });
        patchStorage({
          storageType: 'local',
          localPath: result.warehousePath,
          cloudProvider: undefined,
          connectionId: undefined,
          bucket: undefined,
          prefix: undefined,
        });
        setCatalogTestResult({
          success: true,
          message: `Local catalog initialized and reloaded (${result.namespaces.length} namespace).`,
        });
      },
      onError: (error: unknown) => {
        setStepError(
          error instanceof Error
            ? error.message
            : 'Failed to initialize the local catalog.',
        );
      },
    });
  };

  // ── Test catalog ────────────────────────────────────────────────────────

  const handleTestCatalog = async () => {
    setCatalogTestResult(null);
    try {
      const result = await testCatalogMutation.mutateAsync({
        catalogType: data.catalog.catalogType,
        catalogPath: data.catalog.catalogPath,
        endpoint: data.catalog.endpoint,
        catalogName: data.catalog.catalogName,
        connectionId: data.catalog.polarisConnectionId,
        accessToken: data.catalog.accessToken,
        authMode: data.catalog.authMode,
        oauthClientId: data.catalog.oauthClientId,
        oauthClientSecret: data.catalog.oauthClientSecret,
        oauthServerUri: data.catalog.oauthServerUri,
        oauthScope: data.catalog.oauthScope,
        databaseConnectionId: data.catalog.databaseConnectionId,
        storageType: data.storage.storageType,
      });
      setCatalogTestResult({
        success: result.success,
        message: result.success
          ? 'Catalog connection successful.'
          : (result.error ?? 'Catalog test failed.'),
      });
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error(err);
      setCatalogTestResult({
        success: false,
        message: err?.message ?? 'Catalog test failed.',
      });
    }
  };

  // ── Step content renderers ──────────────────────────────────────────────

  const renderBasicsStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        Instance Details
      </Typography>
      <TextField
        label="Instance Name"
        placeholder="my-iceberg-lake"
        value={data.basics.name}
        onChange={(e) => patchBasics({ name: e.target.value })}
        required
        fullWidth
        inputProps={{ maxLength: 80 }}
        helperText="A unique name to identify this Iceberg instance (max 80 chars)"
      />
      <TextField
        label="Description (optional)"
        placeholder="Production Iceberg catalog for analytics"
        value={data.basics.description ?? ''}
        onChange={(e) => patchBasics({ description: e.target.value })}
        fullWidth
        multiline
        rows={2}
        helperText="Optional human-readable description"
      />
    </Box>
  );

  const renderCatalogStep = () => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Typography variant="subtitle1" fontWeight={600}>
        Catalog Configuration
      </Typography>

      <FormControl fullWidth>
        <InputLabel>Catalog Type</InputLabel>
        <Select
          value={data.catalog.catalogType}
          label="Catalog Type"
          onChange={(e) => {
            const catalogType = e.target.value as IcebergCatalogType;
            const capability = catalogCapabilities.find(
              (item) => item.type === catalogType,
            );
            patchCatalog({
              catalogType,
              // clear type-specific fields on switch
              catalogPath: undefined,
              endpoint: undefined,
              catalogName: undefined,
              databaseConnectionId: undefined,
              accessToken: undefined,
              polarisConnectionId: undefined,
              polarisBucket: undefined,
              polarisPrefix: undefined,
            });
            patchStorage({
              storageType:
                capability?.allowedStorageTypes[0] ?? 'server-managed',
              localPath: undefined,
              cloudProvider: undefined,
              connectionId: undefined,
              bucket: undefined,
              prefix: undefined,
            });
          }}
        >
          {catalogCapabilities.map((capability) => (
            <MenuItem
              key={capability.type}
              value={capability.type}
              disabled={!capability.enabled}
            >
              {capability.label}
              {!capability.enabled ? ' — Coming Next' : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {capabilitiesQuery.isLoading && (
        <Alert severity="info">Loading catalog capabilities…</Alert>
      )}
      {capabilitiesQuery.isError && (
        <Alert severity="error">
          Catalog capabilities could not be loaded. Reopen the wizard and try
          again.
        </Alert>
      )}

      {data.catalog.catalogType === 'sqlite' && (
        <TextField
          label="Local Catalog Database"
          value={data.catalog.catalogPath ?? ''}
          onChange={(e) => patchCatalog({ catalogPath: e.target.value })}
          fullWidth
          required
          placeholder="/data/my-catalog/pyiceberg_catalog.db"
          helperText="Choose a folder to initialize a SQLite catalog and local warehouse"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Pick folder">
                    <IconButton
                      edge="end"
                      onClick={() => pickFolder(initializeLocalCatalog)}
                      disabled={createLocalCatalogMutation.isLoading}
                    >
                      {createLocalCatalogMutation.isLoading ? (
                        <CircularProgress size={20} />
                      ) : (
                        <FolderOpen />
                      )}
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      )}

      {data.catalog.catalogType === 'sql' && (
        <>
          <FormControl fullWidth required>
            <InputLabel>PostgreSQL / Neon Connection</InputLabel>
            <Select
              value={data.catalog.databaseConnectionId ?? ''}
              label="PostgreSQL / Neon Connection"
              onChange={(event) =>
                patchCatalog({ databaseConnectionId: event.target.value })
              }
            >
              {postgresConnections.map((connection) => (
                <MenuItem key={connection.id} value={connection.id}>
                  {connection.connection.name}
                </MenuItem>
              ))}
            </Select>
            {postgresConnections.length === 0 && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 1 }}
              >
                Create and test a PostgreSQL connection in Connections first.
                Neon uses the same PostgreSQL connection type with SSL enabled.
              </Typography>
            )}
          </FormControl>
          <TextField
            label="SQL Catalog Name"
            placeholder="dbt_studio_neon"
            value={data.catalog.catalogName ?? ''}
            onChange={(event) =>
              patchCatalog({ catalogName: event.target.value })
            }
            fullWidth
            required
            helperText="Must match catalog_name for existing PyIceberg tables"
          />
        </>
      )}

      {(data.catalog.catalogType === 'rest' ||
        data.catalog.catalogType === 'polaris') && (
        <>
          <TextField
            label="REST Endpoint"
            placeholder="https://polaris.example.com/api/catalog"
            value={data.catalog.endpoint ?? ''}
            onChange={(e) => patchCatalog({ endpoint: e.target.value })}
            fullWidth
            required
            helperText="The REST catalog server URL"
          />
          <TextField
            label="Catalog Name / Warehouse"
            placeholder="my_catalog"
            value={data.catalog.catalogName ?? ''}
            onChange={(e) => patchCatalog({ catalogName: e.target.value })}
            fullWidth
            required
            helperText="The catalog name or warehouse identifier"
          />
          <FormControl fullWidth>
            <InputLabel>Authentication</InputLabel>
            <Select
              label="Authentication"
              value={data.catalog.authMode ?? 'none'}
              onChange={(event) =>
                patchCatalog({
                  authMode: event.target.value as
                    | 'none'
                    | 'token'
                    | 'oauth-client-credentials',
                  accessToken: undefined,
                  oauthClientSecret: undefined,
                })
              }
            >
              <MenuItem value="none">None</MenuItem>
              <MenuItem value="token">Access Token</MenuItem>
              <MenuItem value="oauth-client-credentials">
                OAuth2 Client Credentials
              </MenuItem>
            </Select>
          </FormControl>
          {data.catalog.authMode === 'token' && (
            <TextField
              label="Access Token"
              type={showToken ? 'text' : 'password'}
              placeholder={
                mode === 'edit' && initialData?.catalogAccessTokenKey
                  ? '••••••••••••••••'
                  : 'Bearer token or OAuth2 access token'
              }
              value={data.catalog.accessToken ?? ''}
              onChange={(e) => patchCatalog({ accessToken: e.target.value })}
              fullWidth
              helperText={
                mode === 'edit' && initialData?.catalogAccessTokenKey
                  ? 'Leave blank to keep the existing token, or enter a new one to replace it.'
                  : 'Optional: OAuth2 access token for this catalog'
              }
              InputProps={{
                endAdornment: (
                  <IconButton
                    size="small"
                    onClick={() => setShowToken((v) => !v)}
                  >
                    {showToken ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                ),
              }}
            />
          )}
          {data.catalog.authMode === 'oauth-client-credentials' && (
            <>
              <TextField
                label="OAuth Client ID"
                value={data.catalog.oauthClientId ?? ''}
                onChange={(event) =>
                  patchCatalog({ oauthClientId: event.target.value })
                }
                fullWidth
                required
              />
              <TextField
                label="OAuth Client Secret"
                type={showClientSecret ? 'text' : 'password'}
                placeholder={
                  mode === 'edit' && initialData?.oauthClientSecretKey
                    ? '••••••••••••••••'
                    : ''
                }
                value={data.catalog.oauthClientSecret ?? ''}
                onChange={(event) =>
                  patchCatalog({ oauthClientSecret: event.target.value })
                }
                fullWidth
                required={
                  !(mode === 'edit' && initialData?.oauthClientSecretKey)
                }
                helperText={
                  mode === 'edit' && initialData?.oauthClientSecretKey
                    ? 'Leave blank to keep the existing secret.'
                    : 'Stored securely in the system keychain.'
                }
                InputProps={{
                  endAdornment: (
                    <IconButton
                      size="small"
                      onClick={() => setShowClientSecret((value) => !value)}
                    >
                      {showClientSecret ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  ),
                }}
              />
              <TextField
                label="OAuth Token Endpoint"
                placeholder="http://localhost:8181/api/catalog/v1/oauth/tokens"
                value={data.catalog.oauthServerUri ?? ''}
                onChange={(event) =>
                  patchCatalog({ oauthServerUri: event.target.value })
                }
                fullWidth
                required
                helperText="Explicit endpoint avoids deprecated REST catalog URL inference."
              />
              <TextField
                label="OAuth Scope (Optional)"
                placeholder="PRINCIPAL_ROLE:ALL"
                value={data.catalog.oauthScope ?? ''}
                onChange={(event) =>
                  patchCatalog({ oauthScope: event.target.value })
                }
                fullWidth
              />
            </>
          )}
        </>
      )}

      {/* Test button */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
        <Button
          variant="outlined"
          startIcon={
            testCatalogMutation.isLoading ? (
              <CircularProgress size={16} />
            ) : (
              <Speed />
            )
          }
          onClick={handleTestCatalog}
          disabled={testCatalogMutation.isLoading}
          size="small"
        >
          {testCatalogMutation.isLoading ? 'Testing…' : 'Test Catalog'}
        </Button>
        {catalogTestResult && (
          <Alert
            severity={catalogTestResult.success ? 'success' : 'error'}
            sx={{ py: 0, flex: 1 }}
            icon={catalogTestResult.success ? <CheckCircle /> : undefined}
          >
            {catalogTestResult.message}
          </Alert>
        )}
      </Box>
    </Box>
  );

  const renderStorageStep = () => {
    const isRestCatalog =
      data.catalog.catalogType === 'rest' ||
      data.catalog.catalogType === 'polaris';

    if (isRestCatalog) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Storage Configuration
          </Typography>
          <Alert severity="info">
            REST catalogs manage table storage on the server. Configure a cloud
            connection below only if your catalog uses{' '}
            <strong>vended credentials</strong> to delegate access to object
            storage.
          </Alert>
          <Typography variant="subtitle2" fontWeight={600}>
            Vended credentials (optional)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Select a Cloud Explorer connection and bucket the catalog can use
            when delegating storage access. Leave blank if credentials are
            handled another way.
          </Typography>
          <DataLakeConnectionSelector
            selectedProvider="all"
            onSelectExisting={(connectionId, bucket, prefix) =>
              patchCatalog({
                polarisConnectionId: connectionId,
                polarisBucket: bucket,
                polarisPrefix: prefix,
              })
            }
            initialConnectionId={data.catalog.polarisConnectionId}
            initialBucket={data.catalog.polarisBucket}
            initialPrefix={data.catalog.polarisPrefix}
          />
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Storage Configuration
        </Typography>

        <FormControl fullWidth>
          <InputLabel>Storage Type</InputLabel>
          <Select
            value={data.storage.storageType}
            label="Storage Type"
            onChange={(e) =>
              patchStorage({
                storageType: e.target.value as IcebergStorageType,
                localPath: undefined,
                cloudProvider: undefined,
                connectionId: undefined,
                bucket: undefined,
                prefix: undefined,
              })
            }
          >
            <MenuItem value="local">Local Filesystem</MenuItem>
            <MenuItem value="cloud">
              Cloud Storage (Cloud Explorer connection)
            </MenuItem>
          </Select>
        </FormControl>

        {data.storage.storageType === 'local' && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <TextField
              label="Local Storage Path"
              placeholder="/data/iceberg/warehouse"
              value={data.storage.localPath ?? ''}
              onChange={(e) => patchStorage({ localPath: e.target.value })}
              fullWidth
              required
              helperText="Local directory where Iceberg data files will be stored"
            />
            <Tooltip title="Pick folder">
              <IconButton
                onClick={() =>
                  pickFolder((p) => patchStorage({ localPath: p }))
                }
              >
                <FolderOpen />
              </IconButton>
            </Tooltip>
          </Box>
        )}

        {data.storage.storageType === 'cloud' && (
          <DataLakeConnectionSelector
            selectedProvider="all"
            onSelectExisting={(connectionId, bucket, prefix, provider) =>
              patchStorage({
                connectionId,
                bucket,
                prefix,
                cloudProvider: provider,
              })
            }
            initialConnectionId={data.storage.connectionId}
            initialBucket={data.storage.bucket}
            initialPrefix={data.storage.prefix}
          />
        )}
      </Box>
    );
  };

  const renderReviewStep = () => {
    const hasToken =
      !!data.catalog.accessToken ||
      (mode === 'edit' && !!initialData?.catalogAccessTokenKey);
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Review &amp; Confirm
        </Typography>
        <Paper variant="outlined" sx={{ p: 2 }}>
          <List dense disablePadding>
            <ListItem disableGutters>
              <ListItemText primary="Name" secondary={data.basics.name} />
            </ListItem>
            {data.basics.description && (
              <ListItem disableGutters>
                <ListItemText
                  primary="Description"
                  secondary={data.basics.description}
                />
              </ListItem>
            )}
            <Divider sx={{ my: 1 }} />
            <ListItem disableGutters>
              <ListItemText
                primary="Catalog Type"
                secondary={
                  <Chip
                    label={data.catalog.catalogType}
                    size="small"
                    color="primary"
                    variant="outlined"
                  />
                }
              />
            </ListItem>
            {data.catalog.catalogType === 'sqlite' && (
              <ListItem disableGutters>
                <ListItemText
                  primary="Catalog Path"
                  secondary={data.catalog.catalogPath}
                />
              </ListItem>
            )}
            {data.catalog.catalogType === 'sql' && (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Database Connection"
                    secondary={
                      postgresConnections.find(
                        (connection) =>
                          connection.id === data.catalog.databaseConnectionId,
                      )?.connection.name ?? data.catalog.databaseConnectionId
                    }
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Catalog Name"
                    secondary={data.catalog.catalogName}
                  />
                </ListItem>
              </>
            )}
            {(data.catalog.catalogType === 'rest' ||
              data.catalog.catalogType === 'polaris') && (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="REST Endpoint"
                    secondary={data.catalog.endpoint}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Catalog Name"
                    secondary={data.catalog.catalogName}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Access Token"
                    secondary={hasToken ? '••••••••••••••••' : '(none)'}
                  />
                </ListItem>
              </>
            )}
            <Divider sx={{ my: 1 }} />
            {data.catalog.catalogType === 'rest' ||
            data.catalog.catalogType === 'polaris' ? (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Storage"
                    secondary="Server-managed (REST catalog)"
                  />
                </ListItem>
                {data.catalog.polarisConnectionId && (
                  <>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Vended Credentials Connection"
                        secondary={data.catalog.polarisConnectionId}
                      />
                    </ListItem>
                    {data.catalog.polarisBucket && (
                      <ListItem disableGutters>
                        <ListItemText
                          primary="Vended Credentials Bucket"
                          secondary={data.catalog.polarisBucket}
                        />
                      </ListItem>
                    )}
                    {data.catalog.polarisPrefix && (
                      <ListItem disableGutters>
                        <ListItemText
                          primary="Vended Credentials Prefix"
                          secondary={data.catalog.polarisPrefix}
                        />
                      </ListItem>
                    )}
                  </>
                )}
              </>
            ) : (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Storage Type"
                    secondary={
                      <Chip
                        label={data.storage.storageType}
                        size="small"
                        variant="outlined"
                      />
                    }
                  />
                </ListItem>
                {data.storage.storageType === 'local' && (
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Storage Path"
                      secondary={data.storage.localPath}
                    />
                  </ListItem>
                )}
                {data.storage.storageType === 'cloud' && (
                  <>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Cloud Provider"
                        secondary={data.storage.cloudProvider}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Bucket"
                        secondary={data.storage.bucket}
                      />
                    </ListItem>
                    {data.storage.prefix && (
                      <ListItem disableGutters>
                        <ListItemText
                          primary="Prefix"
                          secondary={data.storage.prefix}
                        />
                      </ListItem>
                    )}
                  </>
                )}
              </>
            )}
          </List>
        </Paper>
        <Alert severity="info" icon={<IcebergIcon size={20} />}>
          {mode === 'create'
            ? 'Clicking "Create Instance" will save these settings and register the Iceberg catalog. No data files will be modified.'
            : 'Clicking "Save Changes" will update the instance configuration.'}
        </Alert>
      </Box>
    );
  };

  const renderStep = () => {
    switch (activeStep) {
      case 0:
        return renderBasicsStep();
      case 1:
        return renderCatalogStep();
      case 2:
        return renderStorageStep();
      case 3:
        return renderReviewStep();
      default:
        return null;
    }
  };

  const getFinishLabel = () => {
    if (isLoading) return 'Saving\u2026';
    if (mode === 'edit') return 'Save Changes';
    return 'Create Instance';
  };
  const finishLabel = getFinishLabel();

  const isLastStep = activeStep === STEPS.length - 1;

  const getEndIcon = () => {
    if (isLoading) return <CircularProgress size={18} color="inherit" />;
    if (isLastStep) return <CheckCircle />;
    return <ArrowForward />;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 3,
        width: '100%',
        maxWidth: 720,
        mx: 'auto',
      }}
    >
      {/* Header */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <IcebergIcon size={24} />
        <Typography variant="h6" fontWeight={700}>
          {mode === 'edit'
            ? 'Edit Iceberg Instance'
            : 'New Apache Iceberg Instance'}
        </Typography>
      </Box>

      {/* Stepper */}
      <Stepper activeStep={activeStep} alternativeLabel>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step content */}
      <Box sx={{ minHeight: 300 }}>{renderStep()}</Box>

      {/* Step error */}
      {stepError && (
        <Alert severity="error" onClose={() => setStepError(null)}>
          {stepError}
        </Alert>
      )}

      {/* Navigation */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', pt: 1 }}>
        <Button
          variant="outlined"
          color="inherit"
          onClick={activeStep === 0 ? onCancel : handleBack}
          startIcon={activeStep > 0 ? <ArrowBack /> : undefined}
          disabled={isLoading}
        >
          {activeStep === 0 ? 'Cancel' : 'Back'}
        </Button>
        <Button
          variant="contained"
          onClick={isLastStep ? handleFinish : handleNext}
          endIcon={getEndIcon()}
          disabled={isLoading}
        >
          {isLastStep ? finishLabel : 'Next'}
        </Button>
      </Box>
    </Box>
  );
};
