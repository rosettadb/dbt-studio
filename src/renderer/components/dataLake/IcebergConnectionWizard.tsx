/**
 * Iceberg Connection Wizard
 * 4-step wizard for creating/editing Apache Iceberg instances.
 * Pattern: mirrors DataLakeConnectionWizard structure (DuckLake).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Checkbox,
  FormControlLabel,
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
  useListIcebergStorageBuckets,
  useTestIcebergCatalog,
  useTestIcebergStorage,
  useVerifyIcebergSqlAccess,
} from '../../controllers/icebergDatalake.controller';
import { DataLakeConnectionSelector } from './DataLakeConnectionSelector';
import { secureStorageService } from '../../services/secureStorage.service';
import { icebergCatalogImages } from '../../../../assets/connectionIcons';

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
    nessieReference?: string;
    nessieWarehouse?: string;
    hiveUri?: string;
    hiveUgi?: string;
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
  sql: {
    enabled: boolean;
    connectionId?: string;
    provider?: IcebergCloudProvider;
    bucket?: string;
    prefix?: string;
    warehouseMatchAcknowledged: boolean;
    accessVerifiedAt?: string;
    runtimeFingerprint?: string;
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
  sql: { enabled: false, warehouseMatchAcknowledged: false },
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
      nessieReference: initial.nessieReference,
      nessieWarehouse: initial.nessieWarehouse,
      hiveUri: initial.hiveUri,
      hiveUgi: initial.hiveUgi,
      polarisConnectionId: initial.catalogConnectionId,
      polarisBucket: initial.catalogBucket,
      polarisPrefix: initial.catalogPrefix,
    },
    storage: {
      storageType:
        initial.catalogType === 'rest' ||
        initial.catalogType === 'polaris' ||
        initial.catalogType === 'lakekeeper' ||
        initial.catalogType === 'nessie'
          ? 'server-managed'
          : initial.storageType,
      localPath: initial.localPath,
      cloudProvider: initial.cloudProvider,
      connectionId: initial.storageConnectionId,
      bucket: initial.storageBucket,
      prefix: initial.storagePrefix,
    },
    sql: {
      enabled: initial.sqlEnabled ?? false,
      connectionId: initial.sqlStorageConnectionId,
      provider: initial.sqlStorageProvider,
      bucket: initial.sqlStorageBucket,
      prefix: initial.sqlStoragePrefix,
      warehouseMatchAcknowledged:
        initial.sqlWarehouseMatchAcknowledged ?? false,
      accessVerifiedAt: initial.sqlAccessVerifiedAt,
      runtimeFingerprint: initial.sqlRuntimeFingerprint,
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
    if (data.catalog.catalogType === 'hive' && !data.catalog.hiveUri) {
      return 'Hive Metastore Thrift URI is required.';
    }
    if (
      data.catalog.catalogType === 'hive' &&
      data.catalog.hiveUgi &&
      !/^[^:]+:[^:]+$/.test(data.catalog.hiveUgi.trim())
    ) {
      return 'Hive UGI must use the user:group format.';
    }
    if (
      data.catalog.catalogType === 'rest' ||
      data.catalog.catalogType === 'polaris' ||
      data.catalog.catalogType === 'lakekeeper' ||
      data.catalog.catalogType === 'nessie'
    ) {
      if (!data.catalog.endpoint) return 'REST endpoint is required.';
      if (data.catalog.catalogType !== 'nessie' && !data.catalog.catalogName)
        return 'Catalog name / warehouse is required.';
      if (
        data.catalog.catalogType === 'nessie' &&
        !data.catalog.nessieReference
      ) {
        return 'Nessie reference is required.';
      }
      if (
        data.catalog.catalogType === 'nessie' &&
        data.sql.enabled &&
        !data.catalog.nessieWarehouse?.trim()
      ) {
        return 'Nessie warehouse is required for DuckDB SQL access.';
      }
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
      data.catalog.catalogType === 'polaris' ||
      data.catalog.catalogType === 'lakekeeper' ||
      data.catalog.catalogType === 'nessie'
    ) {
      if (!data.sql.enabled) return null;
      if (!data.sql.connectionId)
        return 'A Cloud Explorer connection is required for DuckDB SQL access.';
      if (!data.sql.bucket)
        return 'The matching warehouse bucket is required for DuckDB SQL access.';
      if (!data.sql.warehouseMatchAcknowledged) {
        return 'Confirm that the Cloud connection points to the catalog warehouse.';
      }
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
  const [storageTestResult, setStorageTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [sqlTestResult, setSqlTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const initializedInstanceIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!initialData || initializedInstanceIdRef.current === initialData.id) {
      return;
    }
    initializedInstanceIdRef.current = initialData.id;
    setData(buildInitialData(initialData));
    setActiveStep(0);
    setStepError(null);
    setCatalogTestResult(null);
    setStorageTestResult(null);
  }, [initialData]);

  useEffect(() => {
    const secretKey = initialData?.oauthClientSecretKey;
    if (mode !== 'edit' || !secretKey) return undefined;

    let cancelled = false;
    // eslint-disable-next-line no-void
    void (async () => {
      try {
        const savedSecret = await secureStorageService.get(secretKey);
        if (!cancelled && savedSecret) {
          setData((current) => ({
            ...current,
            catalog: { ...current.catalog, oauthClientSecret: savedSecret },
          }));
        }
      } catch (error) {
        if (!cancelled) {
          setStepError(
            error instanceof Error
              ? error.message
              : 'Failed to load the saved OAuth secret.',
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialData?.oauthClientSecretKey, mode]);

  useEffect(() => {
    if (
      data.catalog.catalogType !== 'polaris' &&
      data.catalog.catalogType !== 'lakekeeper'
    ) {
      return;
    }
    if (
      !data.catalog.polarisConnectionId &&
      !data.catalog.polarisBucket &&
      !data.catalog.polarisPrefix
    ) {
      return;
    }
    setData((current) => ({
      ...current,
      catalog: {
        ...current.catalog,
        polarisConnectionId: undefined,
        polarisBucket: undefined,
        polarisPrefix: undefined,
      },
    }));
  }, [
    data.catalog.catalogType,
    data.catalog.polarisBucket,
    data.catalog.polarisConnectionId,
    data.catalog.polarisPrefix,
  ]);

  // Catalog test
  const testCatalogMutation = useTestIcebergCatalog();
  const testStorageMutation = useTestIcebergStorage();
  const verifySqlMutation = useVerifyIcebergSqlAccess();
  const listStorageBucketsMutation = useListIcebergStorageBuckets();
  const loadStorageBuckets = useCallback(
    (connectionId: string) =>
      listStorageBucketsMutation.mutateAsync({ connectionId }),
    [listStorageBucketsMutation.mutateAsync],
  );
  const createLocalCatalogMutation = useCreateIcebergMetadataFile();
  const capabilitiesQuery = useIcebergCapabilities();
  const catalogCapabilities = capabilitiesQuery.data?.catalogs ?? [];
  const selectedCatalogCapability = catalogCapabilities.find(
    (capability) => capability.type === data.catalog.catalogType,
  );
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

  const patchSql = (patch: Partial<IcebergWizardData['sql']>) =>
    setData((d) => ({
      ...d,
      sql: {
        ...d.sql,
        ...patch,
        accessVerifiedAt: undefined,
        runtimeFingerprint: undefined,
      },
    }));

  const handleSelectCloudStorage = useCallback(
    (
      connectionId: string,
      bucket: string,
      prefix?: string,
      provider?: IcebergCloudProvider,
    ) => {
      setStorageTestResult(null);
      setData((current) => ({
        ...current,
        storage: {
          ...current.storage,
          connectionId,
          bucket,
          prefix,
          cloudProvider: provider,
        },
      }));
    },
    [],
  );

  const handleSelectSqlStorage = useCallback(
    (
      connectionId: string,
      bucket: string,
      prefix?: string,
      provider?: IcebergCloudProvider,
    ) => {
      setStorageTestResult(null);
      setData((current) => ({
        ...current,
        sql: {
          ...current.sql,
          connectionId,
          bucket,
          prefix,
          provider,
          warehouseMatchAcknowledged: false,
          accessVerifiedAt: undefined,
          runtimeFingerprint: undefined,
        },
      }));
    },
    [],
  );

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
        instanceId: mode === 'edit' ? initialData?.id : undefined,
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
        nessieReference: data.catalog.nessieReference,
        nessieWarehouse: data.catalog.nessieWarehouse,
        hiveUri: data.catalog.hiveUri,
        hiveUgi: data.catalog.hiveUgi,
        databaseConnectionId: data.catalog.databaseConnectionId,
        storageType: data.storage.storageType,
      });
      const missingNessieSqlWarehouse =
        result.success &&
        data.catalog.catalogType === 'nessie' &&
        data.sql.enabled &&
        !data.catalog.nessieWarehouse?.trim();
      let message = result.error ?? 'Catalog test failed.';
      if (result.success) message = 'Catalog connection successful.';
      if (missingNessieSqlWarehouse) {
        message =
          'Catalog connected, but a Nessie warehouse name is required for DuckDB SQL access.';
      }
      setCatalogTestResult({
        success: result.success && !missingNessieSqlWarehouse,
        message,
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

  const handleTestStorage = async () => {
    setStorageTestResult(null);
    const validationError = validateStep(2, data);
    if (validationError) {
      setStorageTestResult({ success: false, message: validationError });
      return;
    }
    try {
      const result = await testStorageMutation.mutateAsync({
        connectionId: data.storage.connectionId!,
        bucket: data.storage.bucket!,
        prefix: data.storage.prefix,
      });
      setStorageTestResult({
        success: result.success,
        message: result.success
          ? 'Cloud object storage is accessible.'
          : (result.error ?? 'Cloud storage test failed.'),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error);
      setStorageTestResult({
        success: false,
        message: error?.message ?? 'Cloud storage test failed.',
      });
    }
  };

  const handleTestSqlStorage = async () => {
    setStorageTestResult(null);
    const validationError = validateStep(2, data);
    if (validationError) {
      setStorageTestResult({ success: false, message: validationError });
      return;
    }
    try {
      const result = await testStorageMutation.mutateAsync({
        connectionId: data.sql.connectionId!,
        bucket: data.sql.bucket!,
        prefix: data.sql.prefix,
      });
      setStorageTestResult({
        success: result.success,
        message: result.success
          ? 'The matching object-store location is accessible. DuckDB attachment verification is completed in Phase 3.'
          : (result.error ?? 'Object-store access test failed.'),
      });
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error(error);
      setStorageTestResult({
        success: false,
        message: error?.message ?? 'Object-store access test failed.',
      });
    }
  };

  const handleVerifySqlAccess = async () => {
    if (!initialData?.id) return;
    setSqlTestResult(null);
    const result = await verifySqlMutation.mutateAsync(initialData.id);
    setSqlTestResult({
      success: result.success,
      message: result.success
        ? 'DuckDB attached to the catalog and cleaned up successfully.'
        : (result.error ?? 'DuckDB SQL access test failed.'),
    });
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
          renderValue={(value) => {
            const capability = catalogCapabilities.find(
              (item) => item.type === value,
            );
            const icon =
              icebergCatalogImages[value as keyof typeof icebergCatalogImages];
            return (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                {icon ? (
                  <Box
                    component="img"
                    src={icon}
                    alt=""
                    sx={{ width: 22, height: 22, objectFit: 'contain' }}
                  />
                ) : (
                  <IcebergIcon size={22} />
                )}
                <Typography component="span">
                  {capability?.label ?? value}
                </Typography>
              </Box>
            );
          }}
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
              nessieReference: catalogType === 'nessie' ? 'main' : undefined,
              nessieWarehouse: undefined,
              hiveUri: undefined,
              hiveUgi: undefined,
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
            patchSql({
              enabled: false,
              connectionId: undefined,
              provider: undefined,
              bucket: undefined,
              prefix: undefined,
              warehouseMatchAcknowledged: false,
            });
          }}
        >
          {catalogCapabilities.map((capability) => {
            const icon =
              icebergCatalogImages[
                capability.type as keyof typeof icebergCatalogImages
              ];
            return (
              <MenuItem
                key={capability.type}
                value={capability.type}
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                {icon ? (
                  <Box
                    component="img"
                    src={icon}
                    alt=""
                    sx={{ width: 22, height: 22, objectFit: 'contain' }}
                  />
                ) : (
                  <IcebergIcon size={22} />
                )}
                {capability.label}
              </MenuItem>
            );
          })}
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

      {data.catalog.catalogType === 'hive' && (
        <>
          <TextField
            label="Hive Metastore Thrift URI"
            placeholder="thrift://localhost:9083"
            value={data.catalog.hiveUri ?? ''}
            onChange={(event) => patchCatalog({ hiveUri: event.target.value })}
            fullWidth
            required
            helperText="Use the standalone Hive Metastore Thrift service, not HiveServer2. Comma-separated URIs are supported for high availability."
          />
          <TextField
            label="Hive User / Group (Optional)"
            placeholder="dbt:analytics"
            value={data.catalog.hiveUgi ?? ''}
            onChange={(event) => patchCatalog({ hiveUgi: event.target.value })}
            fullWidth
            helperText="Optional non-Kerberos UGI identity in user:group format."
          />
          <Alert severity="info">
            Kerberos-authenticated Hive Metastores are not enabled in this
            slice. Warehouse storage is configured separately in the next step.
          </Alert>
        </>
      )}

      {(data.catalog.catalogType === 'rest' ||
        data.catalog.catalogType === 'polaris' ||
        data.catalog.catalogType === 'lakekeeper' ||
        data.catalog.catalogType === 'nessie') && (
        <>
          <TextField
            label={
              data.catalog.catalogType === 'nessie'
                ? 'Nessie Iceberg REST Endpoint'
                : 'REST Endpoint'
            }
            placeholder={
              data.catalog.catalogType === 'nessie'
                ? 'http://localhost:19120/iceberg'
                : 'https://polaris.example.com/api/catalog'
            }
            value={data.catalog.endpoint ?? ''}
            onChange={(e) => patchCatalog({ endpoint: e.target.value })}
            fullWidth
            required
            helperText={
              data.catalog.catalogType === 'nessie'
                ? 'Use the Iceberg REST endpoint ending in /iceberg, not the Nessie /api/v2 endpoint.'
                : 'The REST catalog server URL'
            }
          />
          {data.catalog.catalogType === 'nessie' ? (
            <>
              <TextField
                label="Nessie Reference"
                placeholder="main"
                value={data.catalog.nessieReference ?? ''}
                onChange={(event) =>
                  patchCatalog({ nessieReference: event.target.value })
                }
                fullWidth
                required
                helperText="Branch or tag to read and write through Iceberg REST"
              />
              <TextField
                label={
                  data.sql.enabled
                    ? 'Nessie Warehouse'
                    : 'Nessie Warehouse (Optional)'
                }
                placeholder="warehouse"
                value={data.catalog.nessieWarehouse ?? ''}
                onChange={(event) =>
                  patchCatalog({ nessieWarehouse: event.target.value })
                }
                fullWidth
                required={data.sql.enabled}
                helperText={
                  data.sql.enabled
                    ? 'Required for DuckDB SQL access; enter the Nessie warehouse name.'
                    : "Leave blank to use the Nessie server's default warehouse"
                }
              />
            </>
          ) : (
            <TextField
              label="Catalog Name / Warehouse"
              placeholder="my_catalog"
              value={data.catalog.catalogName ?? ''}
              onChange={(e) => patchCatalog({ catalogName: e.target.value })}
              fullWidth
              required
              helperText="The catalog name or warehouse identifier"
            />
          )}
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
                    ? 'Loaded securely from the system keychain.'
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
      data.catalog.catalogType === 'polaris' ||
      data.catalog.catalogType === 'lakekeeper' ||
      data.catalog.catalogType === 'nessie';

    if (isRestCatalog) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <Typography variant="subtitle1" fontWeight={600}>
            Storage Configuration
          </Typography>
          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'transparent' }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Catalog-managed warehouse
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {data.catalog.catalogType === 'polaris' &&
                'Polaris remains the authoritative warehouse owner.'}
              {data.catalog.catalogType === 'lakekeeper' &&
                'Lakekeeper remains the authoritative warehouse owner.'}
              {data.catalog.catalogType === 'nessie' &&
                'Nessie remains the authoritative catalog and warehouse owner.'}
              {data.catalog.catalogType === 'rest' &&
                'The REST catalog remains the authoritative warehouse owner.'}{' '}
              Existing PyIceberg DataLake operations continue to use the
              server-managed warehouse configuration.
            </Typography>
          </Paper>

          <Paper variant="outlined" sx={{ p: 2, bgcolor: 'transparent' }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              DuckDB object-store access
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={data.sql.enabled}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    patchSql(
                      enabled
                        ? { enabled }
                        : {
                            enabled,
                            connectionId: undefined,
                            provider: undefined,
                            bucket: undefined,
                            prefix: undefined,
                            warehouseMatchAcknowledged: false,
                          },
                    );
                    setStorageTestResult(null);
                  }}
                />
              }
              label="Enable SQL Editor and Notebooks"
            />
            {data.sql.enabled && (
              <>
                <DataLakeConnectionSelector
                  selectedProvider="all"
                  onSelectExisting={handleSelectSqlStorage}
                  initialConnectionId={data.sql.connectionId}
                  initialBucket={data.sql.bucket}
                  initialPrefix={data.sql.prefix}
                  loadBuckets={loadStorageBuckets}
                />
                <FormControlLabel
                  sx={{ mt: 1, alignItems: 'flex-start' }}
                  control={
                    <Checkbox
                      checked={data.sql.warehouseMatchAcknowledged}
                      onChange={(event) =>
                        patchSql({
                          warehouseMatchAcknowledged: event.target.checked,
                        })
                      }
                    />
                  }
                  label="I confirm this Cloud connection, bucket, and prefix point to the warehouse configured in the Iceberg catalog service."
                />
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Button
                    variant="outlined"
                    startIcon={
                      testStorageMutation.isLoading ? (
                        <CircularProgress size={16} />
                      ) : (
                        <Speed />
                      )
                    }
                    onClick={handleTestSqlStorage}
                    disabled={testStorageMutation.isLoading}
                    size="small"
                  >
                    {testStorageMutation.isLoading
                      ? 'Testing…'
                      : 'Test Object Storage'}
                  </Button>
                  {storageTestResult && (
                    <Alert
                      severity={storageTestResult.success ? 'success' : 'error'}
                      sx={{ py: 0, flex: 1 }}
                      icon={
                        storageTestResult.success ? <CheckCircle /> : undefined
                      }
                    >
                      {storageTestResult.message}
                    </Alert>
                  )}
                </Box>
              </>
            )}
          </Paper>
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography variant="subtitle1" fontWeight={600}>
          Storage Configuration
        </Typography>

        {data.catalog.catalogType === 'hive' && (
          <Alert severity="info">
            For a local warehouse, the same absolute path must be accessible to
            both DBT Studio and the Hive Metastore service. Mount that path into
            a containerized Metastore at the identical location.
          </Alert>
        )}

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
            {selectedCatalogCapability?.allowedStorageTypes.includes(
              'cloud',
            ) && (
              <MenuItem value="cloud">
                Cloud Storage (Cloud Explorer connection)
              </MenuItem>
            )}
          </Select>
        </FormControl>

        {data.storage.storageType === 'local' && (
          <TextField
            label="Local Storage Path"
            placeholder="/data/iceberg/warehouse"
            value={data.storage.localPath ?? ''}
            onChange={(e) => patchStorage({ localPath: e.target.value })}
            fullWidth
            required
            helperText="Local directory where Iceberg data files will be stored"
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Pick folder">
                      <IconButton
                        edge="end"
                        onClick={() =>
                          pickFolder((p) => patchStorage({ localPath: p }))
                        }
                      >
                        <FolderOpen />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        {data.storage.storageType === 'cloud' && (
          <>
            <DataLakeConnectionSelector
              selectedProvider="all"
              onSelectExisting={handleSelectCloudStorage}
              initialConnectionId={data.storage.connectionId}
              initialBucket={data.storage.bucket}
              initialPrefix={data.storage.prefix}
              loadBuckets={loadStorageBuckets}
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={
                  testStorageMutation.isLoading ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Speed />
                  )
                }
                onClick={handleTestStorage}
                disabled={testStorageMutation.isLoading}
                size="small"
              >
                {testStorageMutation.isLoading
                  ? 'Testing…'
                  : 'Test Cloud Storage'}
              </Button>
              {storageTestResult && (
                <Alert
                  severity={storageTestResult.success ? 'success' : 'error'}
                  sx={{ py: 0, flex: 1 }}
                  icon={storageTestResult.success ? <CheckCircle /> : undefined}
                >
                  {storageTestResult.message}
                </Alert>
              )}
            </Box>
          </>
        )}
      </Box>
    );
  };

  const renderReviewStep = () => {
    const hasToken =
      !!data.catalog.accessToken ||
      (mode === 'edit' && !!initialData?.catalogAccessTokenKey);
    const normalizeDraftValue = (value: unknown) =>
      typeof value === 'string' ? value.trim() : value;
    const hasUnsavedSqlAttachmentChanges =
      mode === 'edit' &&
      !!initialData &&
      [
        [data.catalog.catalogType, initialData.catalogType],
        [data.catalog.endpoint, initialData.endpoint],
        [data.catalog.catalogName, initialData.catalogName],
        [data.catalog.authMode, initialData.catalogAuthMode ?? 'none'],
        [data.catalog.oauthClientId, initialData.oauthClientId],
        [data.catalog.oauthServerUri, initialData.oauthServerUri],
        [data.catalog.oauthScope, initialData.oauthScope],
        [data.catalog.nessieReference, initialData.nessieReference],
        [data.catalog.nessieWarehouse, initialData.nessieWarehouse],
        [data.sql.enabled, initialData.sqlEnabled ?? false],
        [data.sql.connectionId, initialData.sqlStorageConnectionId],
        [data.sql.provider, initialData.sqlStorageProvider],
        [data.sql.bucket, initialData.sqlStorageBucket],
        [data.sql.prefix, initialData.sqlStoragePrefix],
        [
          data.sql.warehouseMatchAcknowledged,
          initialData.sqlWarehouseMatchAcknowledged ?? false,
        ],
      ].some(
        ([draftValue, savedValue]) =>
          normalizeDraftValue(draftValue) !== normalizeDraftValue(savedValue),
      );
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
            {data.catalog.catalogType === 'hive' && (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Metastore URI"
                    secondary={data.catalog.hiveUri}
                  />
                </ListItem>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Hive User / Group"
                    secondary={data.catalog.hiveUgi ?? '(none)'}
                  />
                </ListItem>
              </>
            )}
            {(data.catalog.catalogType === 'rest' ||
              data.catalog.catalogType === 'polaris' ||
              data.catalog.catalogType === 'lakekeeper' ||
              data.catalog.catalogType === 'nessie') && (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="REST Endpoint"
                    secondary={data.catalog.endpoint}
                  />
                </ListItem>
                {data.catalog.catalogType === 'nessie' ? (
                  <>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Reference"
                        secondary={data.catalog.nessieReference}
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Warehouse"
                        secondary={
                          data.catalog.nessieWarehouse ?? 'Default warehouse'
                        }
                      />
                    </ListItem>
                  </>
                ) : (
                  <ListItem disableGutters>
                    <ListItemText
                      primary="Catalog Name"
                      secondary={data.catalog.catalogName}
                    />
                  </ListItem>
                )}
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
            data.catalog.catalogType === 'polaris' ||
            data.catalog.catalogType === 'lakekeeper' ||
            data.catalog.catalogType === 'nessie' ? (
              <>
                <ListItem disableGutters>
                  <ListItemText
                    primary="Storage"
                    secondary="Server-managed (REST catalog)"
                  />
                </ListItem>
                {data.sql.enabled && (
                  <>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="SQL Editor & Notebooks"
                        secondary="Enabled — DuckDB attachment unverified"
                      />
                    </ListItem>
                    <ListItem disableGutters>
                      <ListItemText
                        primary="Cloud Connection"
                        secondary={data.sql.connectionId}
                      />
                    </ListItem>
                    {data.sql.bucket && (
                      <ListItem disableGutters>
                        <ListItemText
                          primary="Warehouse Bucket"
                          secondary={data.sql.bucket}
                        />
                      </ListItem>
                    )}
                    {data.sql.prefix && (
                      <ListItem disableGutters>
                        <ListItemText
                          primary="Warehouse Prefix"
                          secondary={data.sql.prefix}
                        />
                      </ListItem>
                    )}
                  </>
                )}
                {!data.sql.enabled && (
                  <ListItem disableGutters>
                    <ListItemText
                      primary="SQL Editor & Notebooks"
                      secondary="Disabled"
                    />
                  </ListItem>
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
        {data.sql.enabled && mode === 'edit' && initialData?.id && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={
                verifySqlMutation.isLoading ? (
                  <CircularProgress size={16} />
                ) : (
                  <Speed />
                )
              }
              onClick={handleVerifySqlAccess}
              disabled={
                verifySqlMutation.isLoading || hasUnsavedSqlAttachmentChanges
              }
              size="small"
            >
              {verifySqlMutation.isLoading ? 'Testing…' : 'Test SQL Access'}
            </Button>
            {sqlTestResult && (
              <Alert
                severity={sqlTestResult.success ? 'success' : 'error'}
                sx={{ py: 0, flex: 1 }}
                icon={sqlTestResult.success ? <CheckCircle /> : undefined}
              >
                {sqlTestResult.message}
              </Alert>
            )}
            {hasUnsavedSqlAttachmentChanges && (
              <Alert severity="warning" sx={{ py: 0, flex: 1 }}>
                Save these attachment changes, reopen the instance, then test
                SQL access.
              </Alert>
            )}
          </Box>
        )}
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
