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
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
  Divider,
} from '@mui/material';
import { CheckCircle, Error as ErrorIcon } from '@mui/icons-material';

import {
  CloudProvider,
  CloudConnection,
  S3Config,
  AzureConfig,
  GCSConfig,
} from '../../../types/frontend';
import {
  useTestCloudConnection,
  useSaveConnection,
} from '../../controllers/cloudExplorer.controller';

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
}

export const ConnectionForm: React.FC<ConnectionFormProps> = ({
  initialValues,
  isEditing = false,
  connectionId,
}) => {
  const navigate = useNavigate();
  const saveConnection = useSaveConnection();
  const testConnection = useTestCloudConnection();

  const [testStatus, setTestStatus] = useState<
    'idle' | 'testing' | 'success' | 'error'
  >('idle');
  const [errorMessage, setErrorMessage] = useState<string>('');
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
  });

  // Initialize form data from initial values
  useEffect(() => {
    if (initialValues) {
      const { config } = initialValues;
      setFormData({
        name: initialValues.name,
        provider: initialValues.provider,
        projectId: (config as GCSConfig).projectId || '',
        credentials: (config as GCSConfig).credentials || '',
        region: (config as S3Config).region || '',
        accessKeyId: (config as S3Config).accessKeyId || '',
        secretAccessKey: (config as S3Config).secretAccessKey || '',
        accountName: (config as AzureConfig).accountName || '',
        accountKey: (config as AzureConfig).accountKey || '',
        connectionString: (config as AzureConfig).connectionString || '',
      });
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
      const config = createConfigFromFormData();

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
      const config = createConfigFromFormData();
      const connection: CloudConnection = {
        id: connectionId || uuidv4(),
        name: formData.name,
        provider: formData.provider,
        config,
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
              type="password"
              fullWidth
              margin="normal"
              value={formData.secretAccessKey}
              onChange={(e) => handleChange('secretAccessKey', e.target.value)}
              required
              helperText="Your AWS Secret Access Key"
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
              type="password"
              fullWidth
              margin="normal"
              value={formData.accountKey}
              onChange={(e) => handleChange('accountKey', e.target.value)}
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
          <form onSubmit={handleSubmit}>
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

            <FormControl component="fieldset" margin="normal" fullWidth>
              <FormLabel component="legend">Connection Type</FormLabel>
              <RadioGroup
                value={formData.provider}
                onChange={(e) => {
                  const newProvider = e.target.value as CloudProvider;
                  handleChange('provider', newProvider);
                }}
              >
                <FormControlLabel
                  value="gcs"
                  control={<Radio />}
                  label="Google Cloud Storage"
                />
                <FormControlLabel
                  value="aws"
                  control={<Radio />}
                  label="Amazon S3"
                />
                <FormControlLabel
                  value="azure"
                  control={<Radio />}
                  label="Azure Blob Storage"
                />
              </RadioGroup>
            </FormControl>

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
