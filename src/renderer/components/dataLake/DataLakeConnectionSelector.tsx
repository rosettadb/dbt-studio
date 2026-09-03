import React, { useState, useEffect } from 'react';
import {
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Typography,
} from '@mui/material';
import {
  Add,
  Storage as StorageIcon,
  Close,
  CheckCircle,
  Error as ErrorIcon,
  Save,
  Speed,
} from '@mui/icons-material';
import { v4 as uuidv4 } from 'uuid';
import {
  useCloudConnections,
  useCreateCloudConnection,
  useTestDuckLakeConnection,
} from '../../controllers/duckLake.controller';
import useSecureStorage from '../../hooks/useSecureStorage';
import {
  CloudConnection,
  CloudProvider,
  S3Config,
  AzureConfig,
  GCSConfig,
} from '../../../types/frontend';
import { cloudStorageImages } from '../../../../assets/connectionIcons';
import { ConnectionForm } from '../cloudExplorer/ConnectionForm';

interface DataLakeConnectionSelectorProps {
  onSelectExisting: (
    connectionId: string,
    bucket: string,
    prefix?: string,
    provider?: CloudProvider,
  ) => void;
  selectedProvider: CloudProvider | 'all';
  initialConnectionId?: string;
  initialBucket?: string;
  initialPrefix?: string;
  loadBuckets?: (connectionId: string) => Promise<string[]>;
}

type InlineProvider = 'aws' | 'azure' | 'gcs';

const isInlineProvider = (
  provider: CloudProvider | 'all',
): provider is InlineProvider =>
  provider === 'aws' || provider === 'azure' || provider === 'gcs';

const getProviderIcon = (provider: CloudProvider) => {
  const iconSrc = cloudStorageImages[provider];
  return iconSrc ? (
    <img
      src={iconSrc}
      alt=""
      style={{ width: 20, height: 20, objectFit: 'contain' }}
    />
  ) : (
    <StorageIcon />
  );
};

const getProviderLabel = (provider: string) => {
  switch (provider) {
    case 'aws':
      return 'AWS S3';
    case 'azure':
      return 'Azure Blob Storage';
    case 'gcs':
      return 'Google Cloud Storage';
    case 'minio':
      return 'MinIO';
    case 'cloudflare-r2':
      return 'Cloudflare R2';
    case 'backblaze-b2':
      return 'Backblaze B2';
    case 'rustfs':
      return 'rustfs';
    case 'garage':
      return 'Garage';
    case 'all':
      return 'Cloud Explorer';
    default:
      return provider.toUpperCase();
  }
};

export const DataLakeConnectionSelector: React.FC<
  DataLakeConnectionSelectorProps
> = ({
  onSelectExisting,
  selectedProvider,
  initialConnectionId,
  initialBucket,
  initialPrefix,
  loadBuckets,
}) => {
  const { data: connections, isLoading, refetch } = useCloudConnections();
  const createConnection = useCreateCloudConnection();
  const testConnection = useTestDuckLakeConnection();
  const {
    setCloudAwsSecret,
    setCloudAwsSessionToken,
    setCloudAzureKey,
    setCloudGcsCredential,
  } = useSecureStorage();

  // Filter connections by selected provider
  const filteredConnections =
    connections?.filter(
      (conn: any) =>
        selectedProvider === 'all' || conn.provider === selectedProvider,
    ) || [];

  const supportsInlineCreate = isInlineProvider(selectedProvider);

  const [selectedConnectionId, setSelectedConnectionId] = useState<string>('');
  const [bucket, setBucket] = useState<string>('');
  const [prefix, setPrefix] = useState<string>('');
  const [bucketOptions, setBucketOptions] = useState<string[]>([]);
  const [isLoadingBuckets, setIsLoadingBuckets] = useState(false);
  const [bucketLoadError, setBucketLoadError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newConnectionName, setNewConnectionName] = useState('');
  const [newConnectionConfig, setNewConnectionConfig] = useState<any>({});
  const [testError, setTestError] = useState<string | null>(null);

  // Update parent when connection or bucket changes
  React.useEffect(() => {
    if (selectedConnectionId) {
      const selectedConnection = connections?.find(
        (connection: CloudConnection) => connection.id === selectedConnectionId,
      );
      onSelectExisting(
        selectedConnectionId,
        bucket,
        prefix || undefined,
        selectedConnection?.provider,
      );
    }
  }, [selectedConnectionId, bucket, prefix, connections, onSelectExisting]);

  useEffect(() => {
    if (!selectedConnectionId || !loadBuckets) return undefined;
    let cancelled = false;
    setIsLoadingBuckets(true);
    setBucketLoadError(null);
    // eslint-disable-next-line no-void
    void (async () => {
      try {
        const names = await loadBuckets(selectedConnectionId);
        if (!cancelled) setBucketOptions(names);
      } catch (error: unknown) {
        if (!cancelled) {
          setBucketOptions([]);
          setBucketLoadError(
            error instanceof Error ? error.message : 'Failed to load buckets.',
          );
        }
      } finally {
        if (!cancelled) setIsLoadingBuckets(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedConnectionId, loadBuckets]);

  // Sync initial values from parent when revisiting the step
  useEffect(() => {
    if (initialConnectionId && initialConnectionId !== selectedConnectionId) {
      setSelectedConnectionId(initialConnectionId);
    }
    if (typeof initialBucket === 'string' && initialBucket !== bucket) {
      setBucket(initialBucket);
    }
    if (typeof initialPrefix === 'string' && initialPrefix !== prefix) {
      setPrefix(initialPrefix);
    }
  }, [initialConnectionId, initialBucket, initialPrefix]);

  const getBucketLabel = () => {
    switch (selectedProvider) {
      case 'azure':
        return 'Container Name';
      default:
        return 'Bucket Name';
    }
  };

  const getBucketHelperText = () => {
    switch (selectedProvider) {
      case 'aws':
        return 'The S3 bucket where DataLake files will be stored';
      case 'azure':
        return 'The Azure container where DataLake files will be stored';
      case 'gcs':
        return 'The GCS bucket where DataLake files will be stored';
      default:
        return 'The storage location where DataLake files will be stored';
    }
  };

  // Add test status state
  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');

  const handleTestConnection = async () => {
    if (!isInlineProvider(selectedProvider)) return;

    setTestError(null);
    setTestStatus('testing');

    // Validate required fields before testing
    if (!newConnectionName.trim()) {
      setTestError('Connection name is required');
      setTestStatus('error');
      return;
    }

    // Provider-specific validation
    if (selectedProvider === 'aws') {
      if (
        !newConnectionConfig.region ||
        !newConnectionConfig.accessKeyId ||
        !newConnectionConfig.secretAccessKey
      ) {
        setTestError(
          'All AWS fields are required (Region, Access Key ID, Secret Access Key)',
        );
        setTestStatus('error');
        return;
      }
    } else if (selectedProvider === 'azure') {
      if (!newConnectionConfig.accountName || !newConnectionConfig.accountKey) {
        setTestError('Account Name and Account Key are required for Azure');
        setTestStatus('error');
        return;
      }
    } else if (selectedProvider === 'gcs') {
      if (!newConnectionConfig.projectId) {
        setTestError('Project ID is required for GCS');
        setTestStatus('error');
        return;
      }
    }

    try {
      const testResult = await testConnection.mutateAsync({
        provider: selectedProvider,
        config: newConnectionConfig,
      });

      if (!testResult) {
        setTestError(
          'Connection test failed. Please verify your credentials and try again.',
        );
        setTestStatus('error');
        return;
      }

      setTestStatus('success');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Connection test error:', error);
      setTestError(
        error?.message ||
          'Failed to test connection. Please check your credentials.',
      );
      setTestStatus('error');
    }
  };

  const handleSaveConnection = async () => {
    if (!isInlineProvider(selectedProvider)) return;

    setTestError(null);

    // Validate required fields
    if (!newConnectionName.trim()) {
      setTestError('Connection name is required');
      return;
    }

    // Provider-specific validation
    if (selectedProvider === 'aws') {
      if (
        !newConnectionConfig.region ||
        !newConnectionConfig.accessKeyId ||
        !newConnectionConfig.secretAccessKey
      ) {
        setTestError(
          'All AWS fields are required (Region, Access Key ID, Secret Access Key)',
        );
        return;
      }
    } else if (selectedProvider === 'azure') {
      if (!newConnectionConfig.accountName || !newConnectionConfig.accountKey) {
        setTestError('Account Name and Account Key are required for Azure');
        return;
      }
    } else if (selectedProvider === 'gcs') {
      if (!newConnectionConfig.projectId) {
        setTestError('Project ID is required for GCS');
        return;
      }
    }

    try {
      const connectionName = newConnectionName.trim();
      const connectionId = uuidv4();
      const timestamp = new Date();

      let providerConfig: S3Config | AzureConfig | GCSConfig;

      if (selectedProvider === 'aws') {
        const region = newConnectionConfig.region?.trim();
        const accessKeyId = newConnectionConfig.accessKeyId?.trim();
        const secretAccessKey = newConnectionConfig.secretAccessKey?.trim();
        const sessionToken = newConnectionConfig.sessionToken?.trim();

        await setCloudAwsSecret(secretAccessKey, connectionId);
        if (sessionToken) {
          await setCloudAwsSessionToken(sessionToken, connectionId);
        }

        // Exclude sessionToken from persisted config to prevent storing sensitive temporary tokens
        providerConfig = {
          region,
          accessKeyId,
        } as S3Config;
      } else if (selectedProvider === 'azure') {
        const accountName = newConnectionConfig.accountName?.trim();
        const accountKey = newConnectionConfig.accountKey?.trim();
        const connectionString = newConnectionConfig.connectionString?.trim();

        await setCloudAzureKey(accountKey, connectionId);

        providerConfig = {
          accountName,
          connectionString: connectionString || undefined,
        } as AzureConfig;
      } else {
        const projectId = newConnectionConfig.projectId?.trim();
        const credentials = newConnectionConfig.credentials?.trim();

        if (credentials) {
          await setCloudGcsCredential(credentials, connectionId);
        }

        providerConfig = {
          projectId,
        } as GCSConfig;
      }

      const connectionPayload: CloudConnection = {
        id: connectionId,
        name: connectionName,
        provider: selectedProvider,
        config: providerConfig,
        created: timestamp,
        lastUsed: timestamp,
      };

      // Create connection
      await createConnection.mutateAsync(connectionPayload);

      // Refresh connections list
      await refetch();

      // Select the newly created connection
      setSelectedConnectionId(connectionId);
      setBucket('');
      setPrefix('');

      // Close modal and reset
      setIsModalOpen(false);
      setNewConnectionName('');
      setNewConnectionConfig({});
      setTestError(null);
      setTestStatus('idle');
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('Save connection error:', error);
      setTestError(
        error?.message || 'Failed to save connection. Please try again.',
      );
    }
  };

  const renderNewConnectionForm = () => {
    switch (selectedProvider) {
      case 'aws':
        return (
          <>
            <TextField
              label="Connection Name"
              placeholder="My AWS Connection"
              fullWidth
              margin="normal"
              value={newConnectionName}
              onChange={(e) => setNewConnectionName(e.target.value)}
              required
              helperText="A friendly name to identify this connection"
            />
            <TextField
              label="Region"
              placeholder="us-east-1"
              fullWidth
              margin="normal"
              value={newConnectionConfig.region || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  region: e.target.value,
                })
              }
              required
              helperText="Your AWS region (e.g., us-east-1)"
            />
            <TextField
              label="Access Key ID"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              fullWidth
              margin="normal"
              value={newConnectionConfig.accessKeyId || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  accessKeyId: e.target.value,
                })
              }
              required
              helperText="Your AWS Access Key ID"
            />
            <TextField
              label="Secret Access Key"
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              type="password"
              fullWidth
              margin="normal"
              value={newConnectionConfig.secretAccessKey || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  secretAccessKey: e.target.value,
                })
              }
              required
              helperText="Your AWS Secret Access Key"
            />
            <TextField
              label="Session Token (Optional)"
              placeholder="Temporary session token for temporary credentials"
              type="password"
              fullWidth
              margin="normal"
              value={newConnectionConfig.sessionToken || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  sessionToken: e.target.value,
                })
              }
              helperText="Optional: Required when using temporary AWS credentials (e.g., from STS AssumeRole)"
            />
          </>
        );
      case 'azure':
        return (
          <>
            <TextField
              label="Connection Name"
              placeholder="My Azure Connection"
              fullWidth
              margin="normal"
              value={newConnectionName}
              onChange={(e) => setNewConnectionName(e.target.value)}
              required
              helperText="A friendly name to identify this connection"
            />
            <TextField
              label="Storage Account Name"
              placeholder="mystorageaccount"
              fullWidth
              margin="normal"
              value={newConnectionConfig.accountName || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  accountName: e.target.value,
                })
              }
              required
              helperText="Your Azure Storage Account Name"
            />
            <TextField
              label="Storage Account Key"
              placeholder="Your storage account key"
              type="password"
              fullWidth
              margin="normal"
              value={newConnectionConfig.accountKey || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  accountKey: e.target.value,
                })
              }
              required
              helperText="Your Azure Storage Account Key"
            />
            <TextField
              label="Connection String (Optional)"
              placeholder="DefaultEndpointsProtocol=https;AccountName=mystorageaccount;AccountKey=accountkey;EndpointSuffix=core.windows.net"
              fullWidth
              multiline
              rows={3}
              margin="normal"
              value={newConnectionConfig.connectionString || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  connectionString: e.target.value,
                })
              }
              helperText="Your Azure Storage Connection String (optional, can be used instead of account name and key)"
              sx={{ fontFamily: 'monospace' }}
            />
          </>
        );
      case 'gcs':
        return (
          <>
            <TextField
              label="Connection Name"
              placeholder="My GCS Connection"
              fullWidth
              margin="normal"
              value={newConnectionName}
              onChange={(e) => setNewConnectionName(e.target.value)}
              required
              helperText="A friendly name to identify this connection"
            />
            <TextField
              label="Project ID"
              placeholder="my-gcp-project-id"
              fullWidth
              margin="normal"
              value={newConnectionConfig.projectId || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  projectId: e.target.value,
                })
              }
              required
              helperText="Your Google Cloud Project ID"
            />
            <TextField
              label="Service Account Credentials (JSON)"
              placeholder='{"type": "service_account", "project_id": "your-project-id", ...}'
              fullWidth
              multiline
              rows={10}
              margin="normal"
              value={newConnectionConfig.credentials || ''}
              onChange={(e) =>
                setNewConnectionConfig({
                  ...newConnectionConfig,
                  credentials: e.target.value,
                })
              }
              helperText="Paste your service account JSON credentials here (optional for local development)"
              variant="outlined"
              InputProps={{
                style: {
                  minHeight: '120px',
                  fontFamily:
                    'Consolas, Monaco, "Lucida Console", "Liberation Mono", "DejaVu Sans Mono", "Bitstream Vera Sans Mono", "Courier New", monospace',
                  fontSize: '13px',
                },
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: 'auto',
                },
                '& .MuiInputBase-inputMultiline': {
                  height: 'auto !important',
                  resize: 'vertical',
                },
              }}
            />
          </>
        );
      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Connection Selector */}
      <FormControl fullWidth margin="normal">
        <InputLabel>Cloud Connection</InputLabel>
        <Select
          value={selectedConnectionId}
          onChange={(e) => {
            setSelectedConnectionId(e.target.value);
            setBucket('');
            setPrefix('');
            setBucketOptions([]);
            setBucketLoadError(null);
          }}
          label="Cloud Connection"
        >
          {filteredConnections.length === 0 && (
            <MenuItem disabled>
              No {getProviderLabel(selectedProvider)} connections found
            </MenuItem>
          )}
          {filteredConnections.map((conn: any) => (
            <MenuItem key={conn.id} value={conn.id}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  width: '100%',
                }}
              >
                {getProviderIcon(conn.provider)}
                <Box sx={{ flexGrow: 1 }}>{conn.name}</Box>
              </Box>
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      {/* Create New Connection Button */}
      <Button
        variant="outlined"
        onClick={() => setIsModalOpen(true)}
        startIcon={<Add />}
        sx={{ mt: 1, mb: 2 }}
        fullWidth
      >
        Create New {getProviderLabel(selectedProvider)} Connection
      </Button>

      {/* Bucket/Container Input */}
      {loadBuckets ? (
        <FormControl fullWidth margin="normal" required>
          <InputLabel>{getBucketLabel()}</InputLabel>
          <Select
            label={getBucketLabel()}
            value={bucket}
            onChange={(event) => setBucket(event.target.value)}
            disabled={!selectedConnectionId || isLoadingBuckets}
          >
            {isLoadingBuckets && <MenuItem disabled>Loading buckets…</MenuItem>}
            {!isLoadingBuckets && bucketOptions.length === 0 && (
              <MenuItem disabled>No buckets found</MenuItem>
            )}
            {bucket && !bucketOptions.includes(bucket) && (
              <MenuItem value={bucket} disabled>
                {bucket}
              </MenuItem>
            )}
            {bucketOptions.map((name) => (
              <MenuItem key={name} value={name}>
                {name}
              </MenuItem>
            ))}
          </Select>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mx: 1.75, mt: 0.5 }}
          >
            {getBucketHelperText()}
          </Typography>
        </FormControl>
      ) : (
        <TextField
          label={getBucketLabel()}
          fullWidth
          margin="normal"
          value={bucket}
          onChange={(e) => setBucket(e.target.value)}
          required
          helperText={getBucketHelperText()}
          disabled={!selectedConnectionId}
        />
      )}
      {bucketLoadError && <Alert severity="error">{bucketLoadError}</Alert>}

      {/* Prefix Input */}
      <TextField
        label="Folder Prefix (Optional)"
        fullWidth
        margin="normal"
        value={prefix}
        onChange={(e) => setPrefix(e.target.value)}
        helperText="Optional folder path within the bucket (e.g., 'datalakes/prod')"
        disabled={!selectedConnectionId}
        placeholder="datalakes/my-instance"
      />

      {/* New Connection Modal */}
      <Dialog
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: !supportsInlineCreate
            ? { bgcolor: 'transparent', boxShadow: 'none' }
            : undefined,
        }}
      >
        {!supportsInlineCreate ? (
          <DialogContent sx={{ p: 0 }}>
            <ConnectionForm
              initialProvider={
                selectedProvider === 'all' ? undefined : selectedProvider
              }
              onCancel={() => setIsModalOpen(false)}
              onSaved={async (connection) => {
                await refetch();
                setSelectedConnectionId(connection.id);
                setBucket('');
                setPrefix('');
                setIsModalOpen(false);
              }}
            />
          </DialogContent>
        ) : (
          <>
            <DialogTitle>
              Create New {getProviderLabel(selectedProvider)} Connection
              <IconButton
                onClick={() => setIsModalOpen(false)}
                sx={{ position: 'absolute', right: 8, top: 8 }}
              >
                <Close />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {renderNewConnectionForm()}

              {testStatus === 'error' && (
                <Alert severity="error" sx={{ mt: 2 }} icon={<ErrorIcon />}>
                  <Typography variant="subtitle2">Connection Error</Typography>
                  <Typography variant="body2">
                    {testError ||
                      'Failed to connect to storage provider. Please check your credentials.'}
                  </Typography>
                </Alert>
              )}

              {testStatus === 'success' && (
                <Alert severity="success" sx={{ mt: 2 }} icon={<CheckCircle />}>
                  <Typography variant="subtitle2">
                    Connection Successful
                  </Typography>
                  <Typography variant="body2">
                    Successfully connected to storage provider.
                  </Typography>
                </Alert>
              )}
            </DialogContent>
            <DialogActions>
              <Button
                variant="outlined"
                onClick={() => setIsModalOpen(false)}
                color="inherit"
                startIcon={<Close />}
              >
                Cancel
              </Button>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !newConnectionName}
                startIcon={
                  testStatus === 'testing' ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Speed />
                  )
                }
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                onClick={handleSaveConnection}
                variant="contained"
                disabled={!newConnectionName || createConnection.isLoading}
                startIcon={
                  createConnection.isLoading ? (
                    <CircularProgress size={16} />
                  ) : (
                    <Save />
                  )
                }
              >
                {createConnection.isLoading ? 'Saving...' : 'Save Connection'}
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};
