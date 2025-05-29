import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  CircularProgress,
  IconButton,
  InputAdornment,
  useTheme,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { BigQueryConnection, BigQueryDBTConnection, BigQueryTestResponse } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useTestConnection,
  useGetSelectedProject,
} from '../../controllers';
import ConnectionHeader from './connection-header';

type Props = {
  onCancel: () => void;
};

export const BigQuery: React.FC<Props> = ({ onCancel }) => {
  const { data: project } = useGetSelectedProject();
  const navigate = useNavigate();
  const theme = useTheme();

  const existingConnection: BigQueryDBTConnection | undefined = React.useMemo(() => {
    if (project?.dbtConnection?.type === 'bigquery') {
      return project.dbtConnection as BigQueryDBTConnection;
    }
    return undefined;
  }, [project]);

  const [formState, setFormState] = React.useState<BigQueryConnection>({
    type: 'bigquery',
    name: project?.name || 'BigQuery Connection',
    method: existingConnection?.method || 'oauth',
    project: existingConnection?.project || '',
    dataset: existingConnection?.schema || '', // Preserve dataset (schema)
    keyfile: existingConnection?.keyfile || '',
    database: existingConnection?.database || '',
    schema: existingConnection?.schema || '',
    username: '',
    password: '',
    clientId: existingConnection?.clientId || '',  // Preserve clientId
    clientSecret: existingConnection?.clientSecret || '', // Preserve clientSecret
    location: existingConnection?.location,
    priority: existingConnection?.priority || 'interactive',
    accessToken: existingConnection?.accessToken || '', // Initialize from existing connection
    refreshToken: existingConnection?.refreshToken || '', // Initialize from existing connection
  });

  const [showClientSecret, setShowClientSecret] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [isAuthenticating, setIsAuthenticating] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<'idle' | 'success' | 'failed'>('idle');

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('BigQuery connection configured successfully!');
      navigate('/app/project-details');
    },
    onError: (error) => {
      toast.error(`Configuration failed: ${error}`);
    },
  });

  const { mutate: testConnection } = useTestConnection({
    onMutate: () => {
      setIsTesting(true);
      setConnectionStatus('idle');
    },
    onSettled: () => setIsTesting(false),
    onSuccess: (response: BigQueryTestResponse | boolean, variables) => {
      if (typeof response !== 'boolean' && response.success && variables.type === 'bigquery') {
        // Update form state with the tokens that were set in the backend
        setFormState(prev => ({
          ...prev,
          accessToken: response?.accessToken || '',
          refreshToken: response?.refreshToken || ''
        }));
        toast.success('Connection test successful!');
        setConnectionStatus('success');
        return;
      }
      toast.error('Connection test failed');
      setConnectionStatus('failed');
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setConnectionStatus('failed');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
    setConnectionStatus('idle');
  };

  const handleMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const method = e.target.value as 'oauth' | 'service-account';
    setFormState((prev) => ({
      ...prev,
      method,
      keyfile: method === 'oauth' ? '' : prev.keyfile,
      clientId: method === 'service-account' ? '' : prev.clientId,
      clientSecret: method === 'service-account' ? '' : prev.clientSecret,
      accessToken: '',  // Clear tokens when changing methods
      refreshToken: '', // Clear tokens when changing methods
    }));
    setConnectionStatus('idle');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id) return;

    // If using OAuth and we have a successful test but no tokens, show error
    if (formState.method === 'oauth' && !formState.accessToken) {
      toast.error('Please test the connection first to authenticate with OAuth');
      return;
    }

    configureConnection({
      projectId: project.id,
      connection: {
        ...formState,
        database: formState.project,
        schema: formState.dataset,
      },
    });
  };

  const handleTest = () => {
    testConnection({
      ...formState,
      database: formState.project,
      schema: formState.dataset,
    });
  };

  const getIndicatorColor = () => {
    switch (connectionStatus) {
      case 'success':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return '#9e9e9e';
    }
  };

  const getButtonStartIcon = () => {
    if (isTesting) {
      return <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />;
    }
    return null;
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', p: 3 }}>
      <ConnectionHeader
        title={project?.name || 'BigQuery Connection'}
        imageSource={connectionIcons.images.bigquery}
        onClose={onCancel}
        onSave={handleSubmit}
      />

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: '500px',
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <TextField
          label="Connection Name"
          name="name"
          value={formState.name}
          onChange={handleChange}
          fullWidth
          margin="normal"
          required
        />

        <FormControl component="fieldset">
          <FormLabel component="legend">Authentication Method</FormLabel>
          <RadioGroup
            row
            name="method"
            value={formState.method}
            onChange={handleMethodChange}
          >
            <FormControlLabel value="oauth" control={<Radio />} label="OAuth" />
            <FormControlLabel
              value="service-account"
              control={<Radio />}
              label="Service Account"
            />
          </RadioGroup>
        </FormControl>

        <TextField
          label="Project ID"
          name="project"
          value={formState.project}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Dataset"
          name="dataset"
          value={formState.dataset}
          onChange={handleChange}
          fullWidth
          required
        />

        {formState.method === 'oauth' ? (
          <>
            <TextField
              label="OAuth Client ID"
              name="clientId"
              value={formState.clientId}
              onChange={handleChange}
              fullWidth
              required
            />
            <TextField
              label="OAuth Client Secret"
              name="clientSecret"
              type={showClientSecret ? 'text' : 'password'}
              value={formState.clientSecret}
              onChange={handleChange}
              fullWidth
              required
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowClientSecret(!showClientSecret)}
                      onMouseDown={(e) => e.preventDefault()}
                      edge="end"
                    >
                      {showClientSecret ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </>
        ) : (
          <TextField
            label="Service Account Key (JSON)"
            name="keyfile"
            value={formState.keyfile}
            onChange={handleChange}
            fullWidth
            multiline
            rows={10}
            required
            variant="outlined"
            InputProps={{
              style: { minHeight: '120px' },
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
        )}

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="button"
            variant="contained"
            color="primary"
            onClick={handleTest}
            disabled={isTesting || isAuthenticating}
            sx={{
              mr: 2,
              position: 'relative',
              paddingRight: '32px',
              minWidth: '150px',
            }}
            startIcon={getButtonStartIcon()}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
            <Box
              sx={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 12,
                height: 12,
                borderRadius: '50%',
                backgroundColor: getIndicatorColor(),
                border: `1px solid ${theme.palette.primary.contrastText}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            />
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
