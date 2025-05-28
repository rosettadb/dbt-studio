import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormLabel,
  FormControl,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { toast } from 'react-toastify';
import { BigQueryConnection } from '../../../types/backend';
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

  const [formState, setFormState] = React.useState<BigQueryConnection>({
    type: 'bigquery',
    name: project?.name || 'BigQuery Connection',
    method: 'oauth',
    project: '',
    dataset: '',
    keyfile: '',
    username: '',
    password: '',
    database: '',
    schema: '',
  });

  const [isTesting, setIsTesting] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('BigQuery connection configured successfully!');
      navigate(`/app/project-details`);
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
    onSuccess: (success) => {
      if (success) {
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

    // Reset connection status whenever an input changes
    setConnectionStatus('idle');
  };

  const handleMethodChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState((prev) => ({
      ...prev,
      method: e.target.value as 'oauth' | 'service-account',
      keyfile: e.target.value === 'oauth' ? '' : prev.keyfile,
    }));

    // Reset connection status whenever an input changes
    setConnectionStatus('idle');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id) return;

    const connection: BigQueryConnection = {
      type: 'bigquery',
      name: formState.name,
      method: formState.method,
      project: formState.project,
      dataset: formState.dataset,
      keyfile:
        formState.method === 'service-account' ? formState.keyfile : undefined,
      username: '',
      password: '',
      database: formState.project, // Set database to project ID
      schema: formState.dataset,   // Set schema to dataset
      location: formState.location,
      priority: formState.priority,
    };

    configureConnection({
      projectId: project.id,
      connection,
    });
  };

  const handleTest = () => {
    testConnection({
      ...formState,
      database: formState.project,
      schema: formState.dataset,
    });
  };

  // Helper function to get indicator color based on connection status
  const getIndicatorColor = () => {
    switch (connectionStatus) {
      case 'success':
        return theme.palette.success.main;
      case 'failed':
        return theme.palette.error.main;
      default:
        return '#9e9e9e'; // silver/grey for idle state
    }
  };

  // Replace nested ternary with more readable code
  const getButtonStartIcon = () => {
    if (isTesting) {
      return <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />;
    }
    return null;
  };

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        p: 3,
      }}
    >
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

        <FormControl component="fieldset" sx={{ my: 1 }}>
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

        {formState.method === 'service-account' && (
          <TextField
            label="Service Account Key (JSON)"
            name="keyfile"
            value={formState.keyfile}
            onChange={handleChange}
            fullWidth
            multiline
            rows={10}
            required={formState.method === 'service-account'}
            variant="outlined" // Explicitly set variant
            InputProps={{
              style: { minHeight: '120px' }, // Force minimum height
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 'auto', // Allow the input to expand
              },
              '& .MuiInputBase-inputMultiline': {
                height: 'auto !important', // Override any height constraints
                resize: 'vertical', // Allow user to resize vertically
              },
            }}
          />
        )}

        <Box
          sx={{
            mt: 3,
            display: 'flex',
            justifyContent: 'flex-start',
          }}
        >
          <Button
            type="button"
            variant="contained"
            color="primary"
            onClick={handleTest}
            disabled={isTesting}
            sx={{
              mr: 2,
              position: 'relative',
              paddingRight: '32px',
              minWidth: '150px',
            }}
            startIcon={getButtonStartIcon()}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}

            {/* Connection status indicator inside button */}
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
