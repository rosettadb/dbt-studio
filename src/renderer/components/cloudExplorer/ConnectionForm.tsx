import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import {
  Box,
  Button,
  Card,
  CardContent,
  TextField,
  Typography,
  FormControl,
  FormLabel,
  Alert,
  CircularProgress,
  Divider,
  Grid,
  CardActionArea,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  CheckCircle,
  Error as ErrorIcon,
  Cable,
  Add,
  Edit,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';

import {
  CloudProvider,
  CloudConnection,
  S3Config,
  AzureConfig,
  GCSConfig,
  MinIOConfig,
  CloudflareR2Config,
  BackblazeB2Config,
  RustfsConfig,
} from '../../../types/frontend';
import {
  useTestCloudConnection,
  useSaveConnection,
} from '../../controllers/cloudExplorer.controller';
import { cloudStorageImages } from '../../../../assets/connectionIcons';
import useSecureStorage from '../../hooks/useSecureStorage';

interface ConnectionFormProps {
  initialValues?: CloudConnection;
  isEditing?: boolean;
  connectionId?: string;
}

interface FormData {
  name: string;
  provider: CloudProvider;
  projectId: string;
  credentials: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  accountName: string;
  accountKey: string;
  connectionString: string;
  // MinIO fields
  endpoint: string;
  useSSL: boolean;
  // Cloudflare R2 fields
  accountId: string;
  jurisdiction: 'eu' | '';
  // Backblaze B2 fields
  applicationKeyId: string;
  applicationKey: string;
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  initialValues,
  isEditing = false,
  connectionId,
}) => {
  const navigate = useNavigate();
  const saveConnection = useSaveConnection();
  const testConnection = useTestCloudConnection();
  const {
    setCloudGcsCredential,
    getCloudGcsCredential,
    setCloudAwsSecret,
    getCloudAwsSecret,
    setCloudAzureKey,
    getCloudAzureKey,
    setCloudMinioSecret,
    getCloudMinioSecret,
    setCloudR2Secret,
    getCloudR2Secret,
    setCloudB2Secret,
    getCloudB2Secret,
    setCloudRustfsSecret,
    getCloudRustfsSecret,
  } = useSecureStorage();

  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<FormData>({
    name: initialValues?.name || '',
    provider: initialValues?.provider || 'gcs',
    projectId: '',
    credentials: '',
    region: '',
    accessKeyId: '',
    secretAccessKey: '',
    accountName: '',
    accountKey: '',
    connectionString: '',
    endpoint: '',
    useSSL: false,
    accountId: '',
    jurisdiction: '',
    applicationKeyId: '',
    applicationKey: '',
  });

  const getProviderIcon = (provider: CloudProvider, size: number = 20) => {
    const iconSrc = cloudStorageImages[provider];
    if (iconSrc) {
      return (
        <img
          src={iconSrc}
          alt={provider}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
          }}
        />
      );
    }
    return null;
  };

  // Initialize form data from initial values
  useEffect(() => {
    if (initialValues) {
      const { config } = initialValues;
      setFormData({
        name: initialValues.name,
        provider: initialValues.provider,
        projectId: (config as GCSConfig).projectId || '',
        credentials: (config as GCSConfig).credentials || '',
        region:
          (config as S3Config).region ||
          (config as MinIOConfig).region ||
          (config as RustfsConfig).region ||
          '',
        accessKeyId:
          (config as S3Config).accessKeyId ||
          (config as MinIOConfig).accessKeyId ||
          (config as CloudflareR2Config).accessKeyId ||
          (config as BackblazeB2Config).applicationKeyId ||
          (config as RustfsConfig).accessKeyId ||
          '',
        secretAccessKey:
          (config as S3Config).secretAccessKey ||
          (config as MinIOConfig).secretAccessKey ||
          (config as CloudflareR2Config).secretAccessKey ||
          (config as RustfsConfig).secretAccessKey ||
          '',
        accountName: (config as AzureConfig).accountName || '',
        accountKey: (config as AzureConfig).accountKey || '',
        connectionString: (config as AzureConfig).connectionString || '',
        endpoint:
          (config as MinIOConfig).endpoint ||
          (config as BackblazeB2Config).endpoint ||
          (config as RustfsConfig).endpoint ||
          '',
        useSSL:
          (config as MinIOConfig).useSSL ||
          (config as RustfsConfig).useSSL ||
          false,
        accountId: (config as CloudflareR2Config).accountId || '',
        jurisdiction: (config as CloudflareR2Config).jurisdiction || '',
        applicationKeyId: (config as BackblazeB2Config).applicationKeyId || '',
        applicationKey: (config as BackblazeB2Config).applicationKey || '',
      });
    }
  }, [initialValues]);

  // On edit, fetch credentials from secure storage
  useEffect(() => {
    if (initialValues) {
      const { id, provider } = initialValues;
      (async () => {
        if (provider === 'gcs') {
          const stored = await getCloudGcsCredential(id);
          setFormData((prev) => ({ ...prev, credentials: stored || '' }));
        } else if (provider === 'aws') {
          const stored = await getCloudAwsSecret(id);
          setFormData((prev) => ({ ...prev, secretAccessKey: stored || '' }));
        } else if (provider === 'azure') {
          const stored = await getCloudAzureKey(id);
          setFormData((prev) => ({ ...prev, accountKey: stored || '' }));
        } else if (provider === 'minio') {
          const stored = await getCloudMinioSecret(id);
          setFormData((prev) => ({ ...prev, secretAccessKey: stored || '' }));
        } else if (provider === 'cloudflare-r2') {
          const stored = await getCloudR2Secret(id);
          setFormData((prev) => ({ ...prev, secretAccessKey: stored || '' }));
        } else if (provider === 'backblaze-b2') {
          const stored = await getCloudB2Secret(id);
          setFormData((prev) => ({ ...prev, applicationKey: stored || '' }));
        } else if (provider === 'rustfs') {
          const stored = await getCloudRustfsSecret(id);
          setFormData((prev) => ({ ...prev, secretAccessKey: stored || '' }));
        }
      })();
    }
  }, [initialValues]);

  const handleChange = (field: keyof FormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.name.trim()) return false;

    switch (formData.provider) {
      case 'gcs':
        return !!formData.projectId.trim();
      case 'aws':
        return (
          !!formData.region.trim() &&
          !!formData.accessKeyId.trim() &&
          !!formData.secretAccessKey.trim()
        );
      case 'azure':
        return !!formData.accountName.trim() && !!formData.accountKey.trim();
      case 'minio':
        return (
          !!formData.endpoint.trim() &&
          !!formData.accessKeyId.trim() &&
          !!formData.secretAccessKey.trim()
        );
      case 'cloudflare-r2':
        return (
          !!formData.accountId.trim() &&
          !!formData.accessKeyId.trim() &&
          !!formData.secretAccessKey.trim()
        );
      case 'backblaze-b2':
        return (
          !!formData.applicationKeyId.trim() && !!formData.applicationKey.trim()
        );
      case 'rustfs':
        return (
          !!formData.endpoint.trim() &&
          !!formData.accessKeyId.trim() &&
          !!formData.secretAccessKey.trim()
        );
      default:
        return false;
    }
  };

  const createConfigFromFormData = () => {
    switch (formData.provider) {
      case 'gcs':
        return {
          projectId: formData.projectId.trim(),
          credentials: formData.credentials.trim() || undefined,
        } as GCSConfig;
      case 'aws':
        return {
          region: formData.region.trim(),
          accessKeyId: formData.accessKeyId.trim(),
          secretAccessKey: formData.secretAccessKey.trim(),
        } as S3Config;
      case 'azure':
        return {
          accountName: formData.accountName.trim(),
          accountKey: formData.accountKey.trim(),
          connectionString: formData.connectionString.trim() || undefined,
        } as AzureConfig;
      case 'minio':
        return {
          endpoint: formData.endpoint.trim(),
          accessKeyId: formData.accessKeyId.trim(),
          secretAccessKey: formData.secretAccessKey.trim(),
          useSSL: formData.useSSL,
          region: formData.region.trim() || 'us-east-1',
        } as MinIOConfig;
      case 'cloudflare-r2':
        return {
          accountId: formData.accountId.trim(),
          accessKeyId: formData.accessKeyId.trim(),
          secretAccessKey: formData.secretAccessKey.trim(),
          jurisdiction: formData.jurisdiction || undefined,
        } as CloudflareR2Config;
      case 'backblaze-b2':
        return {
          applicationKeyId: formData.applicationKeyId.trim(),
          applicationKey: formData.applicationKey.trim(),
          endpoint:
            formData.endpoint.trim() || 's3.us-west-004.backblazeb2.com',
        } as BackblazeB2Config;
      case 'rustfs':
        return {
          endpoint: formData.endpoint.trim(),
          accessKeyId: formData.accessKeyId.trim(),
          secretAccessKey: formData.secretAccessKey.trim(),
          useSSL: formData.useSSL,
          region: formData.region.trim() || 'us-east-1',
        } as RustfsConfig;
      default:
        throw new Error(`Unsupported provider: ${formData.provider}`);
    }
  };

  const handleTestConnection = async () => {
    if (!validateForm()) {
      return;
    }

    setTestStatus('testing');
    setErrorMessage('');

    try {
      const rawConfig = createConfigFromFormData();
      const config = rawConfig;

      // Validate config before sending
      if (!config) {
        throw new Error('Failed to create configuration object');
      }

      await testConnection.mutateAsync({
        provider: formData.provider,
        config,
      });
      setTestStatus('success');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[MinIO Frontend] Test connection failed:', error);
      setTestStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Unknown error occurred',
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      const rawConfig = createConfigFromFormData();
      let finalConfig: typeof rawConfig;

      // Generate connection ID first so we can use it for secure storage
      const connId = connectionId || uuidv4();

      if (formData.provider === 'gcs') {
        await setCloudGcsCredential(formData.credentials, connId);
        // Omit credentials if present
        const config = { ...rawConfig };
        if ('credentials' in config) {
          delete (config as any).credentials;
        }
        finalConfig = config;
      } else if (formData.provider === 'aws') {
        await setCloudAwsSecret(formData.secretAccessKey, connId);
        const config = { ...rawConfig };
        if ('secretAccessKey' in config) {
          delete (config as any).secretAccessKey;
        }
        finalConfig = config;
      } else if (formData.provider === 'azure') {
        await setCloudAzureKey(formData.accountKey, connId);
        const config = { ...rawConfig };
        if ('accountKey' in config) {
          delete (config as any).accountKey;
        }
        finalConfig = config;
      } else if (formData.provider === 'minio') {
        await setCloudMinioSecret(formData.secretAccessKey, connId);
        const config = { ...rawConfig };
        if ('secretAccessKey' in config) {
          delete (config as any).secretAccessKey;
        }
        finalConfig = config;
      } else if (formData.provider === 'cloudflare-r2') {
        await setCloudR2Secret(formData.secretAccessKey, connId);
        const config = { ...rawConfig };
        if ('secretAccessKey' in config) {
          delete (config as any).secretAccessKey;
        }
        finalConfig = config;
      } else if (formData.provider === 'backblaze-b2') {
        await setCloudB2Secret(formData.applicationKey, connId);
        const config = { ...rawConfig };
        if ('applicationKey' in config) {
          delete (config as any).applicationKey;
        }
        finalConfig = config;
      } else if (formData.provider === 'rustfs') {
        await setCloudRustfsSecret(formData.secretAccessKey, connId);
        const config = { ...rawConfig };
        if ('secretAccessKey' in config) {
          delete (config as any).secretAccessKey;
        }
        finalConfig = config;
      } else {
        finalConfig = rawConfig;
      }
      const connection: CloudConnection = {
        id: connId,
        name: formData.name,
        provider: formData.provider,
        config: finalConfig,
        created: initialValues?.created || new Date(),
        lastUsed: new Date(),
      };
      await saveConnection.mutateAsync(connection);
      navigate('/app/cloud-explorer/connections');
    } catch (error) {
      setTestStatus('error');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save connection',
      );
    }
  };

  const renderProviderFields = () => {
    switch (formData.provider) {
      case 'gcs':
        return (
          <>
            <TextField
              label="Project ID"
              placeholder="my-gcp-project-id"
              fullWidth
              margin="normal"
              value={formData.projectId}
              onChange={(e) => handleChange('projectId', e.target.value)}
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
              value={formData.credentials}
              onChange={(e) => handleChange('credentials', e.target.value)}
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
      case 'aws':
        return (
          <>
            <TextField
              label="Region"
              placeholder="us-east-1"
              fullWidth
              margin="normal"
              value={formData.region}
              onChange={(e) => handleChange('region', e.target.value)}
              required
              helperText="Your AWS region (e.g., us-east-1)"
            />
            <TextField
              label="Access Key ID"
              placeholder="AKIAIOSFODNN7EXAMPLE"
              fullWidth
              margin="normal"
              value={formData.accessKeyId}
              onChange={(e) => handleChange('accessKeyId', e.target.value)}
              required
              helperText="Your AWS Access Key ID"
            />
            <TextField
              label="Secret Access Key"
              placeholder="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              required
              helperText="Your AWS Secret Access Key"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </>
        );
      case 'minio':
        return (
          <>
            <TextField
              label="Endpoint"
              placeholder="localhost:9000"
              fullWidth
              margin="normal"
              value={formData.endpoint}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              required
              helperText="MinIO server endpoint (host:port)"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <FormControl component="fieldset">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <input
                    type="checkbox"
                    id="useSSL"
                    checked={formData.useSSL}
                    onChange={(e) =>
                      handleChange('useSSL', e.target.checked as any)
                    }
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="useSSL" style={{ cursor: 'pointer' }}>
                    Use SSL/TLS
                  </label>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Enable for HTTPS connections (default: HTTP)
                </Typography>
              </FormControl>
            </Box>
            <TextField
              label="Access Key ID"
              placeholder="minioadmin"
              fullWidth
              margin="normal"
              value={formData.accessKeyId}
              onChange={(e) => handleChange('accessKeyId', e.target.value)}
              required
              helperText="Your MinIO Access Key"
            />
            <TextField
              label="Secret Access Key"
              placeholder="minioadmin"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              required
              helperText="Your MinIO Secret Key"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Region (Optional)"
              placeholder="us-east-1"
              fullWidth
              margin="normal"
              value={formData.region}
              onChange={(e) => handleChange('region', e.target.value)}
              helperText="MinIO region (default: us-east-1)"
            />
          </>
        );
      case 'cloudflare-r2':
        return (
          <>
            <TextField
              label="Account ID"
              placeholder="a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
              fullWidth
              margin="normal"
              value={formData.accountId}
              onChange={(e) => handleChange('accountId', e.target.value)}
              required
              helperText="Your Cloudflare Account ID (alphanumeric string, typically 32 characters)"
            />
            <TextField
              label="Access Key ID"
              placeholder="Your R2 API token"
              fullWidth
              margin="normal"
              value={formData.accessKeyId}
              onChange={(e) => handleChange('accessKeyId', e.target.value)}
              required
              helperText="Your R2 API token (Access Key ID)"
            />
            <TextField
              label="Secret Access Key"
              placeholder="Your R2 API secret"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              required
              helperText="Your R2 API secret (Secret Access Key)"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <FormControl fullWidth margin="normal">
              <FormLabel>Jurisdiction (Optional)</FormLabel>
              <Box
                sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 1 }}
              >
                <input
                  type="checkbox"
                  id="euJurisdiction"
                  checked={formData.jurisdiction === 'eu'}
                  onChange={(e) =>
                    handleChange('jurisdiction', e.target.checked ? 'eu' : '')
                  }
                  style={{ cursor: 'pointer' }}
                />
                <label htmlFor="euJurisdiction" style={{ cursor: 'pointer' }}>
                  EU Jurisdiction Only
                </label>
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Enable to restrict data to EU-only storage (optional)
              </Typography>
            </FormControl>
          </>
        );
      case 'backblaze-b2':
        return (
          <>
            <TextField
              label="Application Key ID"
              placeholder="Your B2 Application Key ID"
              fullWidth
              margin="normal"
              value={formData.applicationKeyId}
              onChange={(e) => handleChange('applicationKeyId', e.target.value)}
              required
              helperText="Your Backblaze B2 Application Key ID"
            />
            <TextField
              label="Application Key"
              placeholder="Your B2 Application Key"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.applicationKey}
              onChange={(e) => handleChange('applicationKey', e.target.value)}
              required
              helperText="Your Backblaze B2 Application Key (stored securely)"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Endpoint (Optional)"
              placeholder="s3.us-west-004.backblazeb2.com"
              fullWidth
              margin="normal"
              value={formData.endpoint}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              helperText="B2 S3-compatible endpoint. US: s3.us-west-004.backblazeb2.com, EU: s3.eu-central-003.backblazeb2.com"
            />
          </>
        );
      case 'rustfs':
        return (
          <>
            <TextField
              label="Endpoint"
              placeholder="192.168.1.100:9000"
              fullWidth
              margin="normal"
              value={formData.endpoint}
              onChange={(e) => handleChange('endpoint', e.target.value)}
              required
              helperText="rustfs server endpoint (host:port)"
            />
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
              <FormControl component="fieldset">
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <input
                    type="checkbox"
                    id="useSSL-rustfs"
                    checked={formData.useSSL}
                    onChange={(e) =>
                      handleChange('useSSL', e.target.checked as any)
                    }
                    style={{ cursor: 'pointer' }}
                  />
                  <label htmlFor="useSSL-rustfs" style={{ cursor: 'pointer' }}>
                    Use SSL/TLS
                  </label>
                </Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ mt: 0.5 }}
                >
                  Enable for HTTPS connections (default: HTTP)
                </Typography>
              </FormControl>
            </Box>
            <TextField
              label="Access Key ID"
              placeholder="rustfsadmin"
              fullWidth
              margin="normal"
              value={formData.accessKeyId}
              onChange={(e) => handleChange('accessKeyId', e.target.value)}
              required
              helperText="Your rustfs Access Key"
            />
            <TextField
              label="Secret Access Key"
              placeholder="rustfssecret"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              required
              helperText="Your rustfs Secret Key (stored securely)"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Region (Optional)"
              placeholder="us-east-1"
              fullWidth
              margin="normal"
              value={formData.region}
              onChange={(e) => handleChange('region', e.target.value)}
              helperText="rustfs region (default: us-east-1)"
            />
          </>
        );
      case 'azure':
        return (
          <>
            <TextField
              label="Storage Account Name"
              placeholder="mystorageaccount"
              fullWidth
              margin="normal"
              value={formData.accountName}
              onChange={(e) => handleChange('accountName', e.target.value)}
              required
              helperText="Your Azure Storage Account Name"
            />
            <TextField
              label="Storage Account Key"
              placeholder="Your storage account key"
              type={showPassword ? 'text' : 'password'}
              fullWidth
              margin="normal"
              value={formData.accountKey}
              onChange={(e) => handleChange('accountKey', e.target.value)}
              required
              helperText="Your Azure Storage Account Key"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="toggle password visibility"
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <TextField
              label="Connection String (Optional)"
              placeholder="DefaultEndpointsProtocol=https;AccountName=mystorageaccount;AccountKey=accountkey;EndpointSuffix=core.windows.net"
              fullWidth
              multiline
              rows={3}
              margin="normal"
              value={formData.connectionString}
              onChange={(e) => handleChange('connectionString', e.target.value)}
              helperText="Your Azure Storage Connection String (optional, can be used instead of account name and key)"
              sx={{ fontFamily: 'monospace' }}
            />
          </>
        );
      default:
        return null;
    }
  };

  const isFormValid = validateForm();

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', p: 2 }}>
      <Card>
        <CardContent>
          <Box sx={{ mb: 3 }}>
            <Typography
              variant="h5"
              component="h1"
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}
            >
              {isEditing ? <Edit color="primary" /> : <Add color="primary" />}
              {isEditing ? 'Edit Connection' : 'New Connection'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {isEditing
                ? 'Update your cloud storage connection settings'
                : 'Connect to your cloud storage provider'}
            </Typography>
          </Box>
          <form onSubmit={handleSubmit}>
            <FormControl component="fieldset" margin="normal" fullWidth>
              <FormLabel
                component="legend"
                sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
              >
                <Cable fontSize="small" />
                Connection Type
              </FormLabel>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'gcs' ? 'elevation' : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'gcs' ? '2px solid' : '1px solid',
                      borderColor:
                        formData.provider === 'gcs'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'gcs')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('gcs', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          Google Cloud Storage
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'aws' ? 'elevation' : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'aws' ? '2px solid' : '1px solid',
                      borderColor:
                        formData.provider === 'aws'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'aws')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('aws', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          Amazon S3
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'azure' ? 'elevation' : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'azure'
                          ? '2px solid'
                          : '1px solid',
                      borderColor:
                        formData.provider === 'azure'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'azure')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('azure', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          Azure Blob Storage
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'minio' ? 'elevation' : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'minio'
                          ? '2px solid'
                          : '1px solid',
                      borderColor:
                        formData.provider === 'minio'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'minio')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('minio', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          MinIO
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'cloudflare-r2'
                        ? 'elevation'
                        : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'cloudflare-r2'
                          ? '2px solid'
                          : '1px solid',
                      borderColor:
                        formData.provider === 'cloudflare-r2'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'cloudflare-r2')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('cloudflare-r2', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          Cloudflare R2
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'backblaze-b2'
                        ? 'elevation'
                        : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'backblaze-b2'
                          ? '2px solid'
                          : '1px solid',
                      borderColor:
                        formData.provider === 'backblaze-b2'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'backblaze-b2')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('backblaze-b2', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          Backblaze B2
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={3}>
                  <Card
                    variant={
                      formData.provider === 'rustfs' ? 'elevation' : 'outlined'
                    }
                    sx={{
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      height: '120px',
                      border:
                        formData.provider === 'rustfs'
                          ? '2px solid'
                          : '1px solid',
                      borderColor:
                        formData.provider === 'rustfs'
                          ? 'primary.main'
                          : 'divider',
                      '&:hover': {
                        elevation: 4,
                        borderColor: 'primary.main',
                      },
                    }}
                  >
                    <CardActionArea
                      onClick={() => handleChange('provider', 'rustfs')}
                      sx={{ p: 2, height: '100%' }}
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 1,
                          height: '100%',
                        }}
                      >
                        {getProviderIcon('rustfs', 48)}
                        <Typography
                          variant="body2"
                          textAlign="center"
                          fontWeight="medium"
                        >
                          rustfs
                        </Typography>
                      </Box>
                    </CardActionArea>
                  </Card>
                </Grid>
              </Grid>
            </FormControl>

            <TextField
              label="Connection Name"
              placeholder="My Storage Connection"
              fullWidth
              margin="normal"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              required
              helperText="A friendly name to identify this connection"
            />

            {renderProviderFields()}

            {testStatus === 'error' && (
              <Alert severity="error" sx={{ mt: 2 }} icon={<ErrorIcon />}>
                <Typography variant="subtitle2">Connection Error</Typography>
                <Typography variant="body2">
                  {errorMessage ||
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

            <Divider sx={{ my: 3 }} />

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                onClick={() => navigate('/app/cloud-explorer/connections')}
              >
                Cancel
              </Button>
              <Button
                variant="outlined"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing' || !isFormValid}
                startIcon={
                  testStatus === 'testing' ? (
                    <CircularProgress size={16} />
                  ) : null
                }
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={!isFormValid || saveConnection.isLoading}
                startIcon={
                  saveConnection.isLoading ? (
                    <CircularProgress size={16} />
                  ) : null
                }
              >
                {isEditing ? 'Update' : 'Save'} Connection
              </Button>
            </Box>
          </form>
        </CardContent>
      </Card>
    </Box>
  );
};
