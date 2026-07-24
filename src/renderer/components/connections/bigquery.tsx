import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  CircularProgress,
  useTheme,
} from '@mui/material';
import { toast } from 'react-toastify';
import {
  BigQueryConnection,
  ConnectionModel,
  ConnectorTestResponse,
} from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useTestConnection,
  useUpdateConnection,
  useGetConnections,
} from '../../controllers';
import ConnectionHeader from './connection-header';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import useSecureStorage from '../../hooks/useSecureStorage';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

export const BigQuery: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();

  const existingConnection = React.useMemo(
    () => connection?.connection as BigQueryConnection,
    [connection],
  );

  const duplicateConnection = React.useMemo(
    () => duplicateFrom?.connection as BigQueryConnection,
    [duplicateFrom],
  );

  const [formState, setFormState] = React.useState<BigQueryConnection>({
    type: 'bigquery',
    name: existingConnection?.name ?? suggestedName ?? '',
    method: 'service-account',
    project: existingConnection?.project ?? duplicateConnection?.project ?? '',
    dataset: existingConnection?.schema ?? duplicateConnection?.schema ?? '',
    keyfile: existingConnection?.keyfile ?? duplicateConnection?.keyfile ?? '',
    database:
      existingConnection?.database ?? duplicateConnection?.database ?? '',
    schema: existingConnection?.schema ?? duplicateConnection?.schema ?? '',
    username: '',
    password: '',
    location: existingConnection?.location ?? duplicateConnection?.location,
    priority:
      existingConnection?.priority ??
      duplicateConnection?.priority ??
      'interactive',
  });

  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [nameTouched, setNameTouched] = React.useState(false);
  const [keyfileError, setKeyfileError] = React.useState<string>('');

  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
    onSuccess: (response: ConnectorTestResponse) => {
      // Handle BigQuery specific response
      if (
        typeof response === 'object' &&
        response !== null &&
        'success' in response &&
        response.success
      ) {
        toast.success('Connection test successful!');
        setConnectionStatus('success');
      } else if (typeof response === 'boolean' && response) {
        toast.success('Connection test successful!');
        setConnectionStatus('success');
      } else {
        toast.error('Connection test failed');
        setConnectionStatus('failed');
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setConnectionStatus('failed');
    },
  });

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('BigQuery connection configured successfully!');
        if (projectId) {
          navigate('/app');
          return;
        }
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });

  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: () => {
        toast.success('BigQuery connection updated successfully!');
        if (projectId) {
          navigate('/app');
          return;
        }
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Update failed: ${error}`);
      },
    });

  const {
    setBigQueryServiceAccountKey,
    getBigQueryServiceAccountKey,
    setConnectionField,
  } = useSecureStorage();

  React.useEffect(() => {
    // On edit or duplicate, load the service account key from secure storage
    let isMounted = true;
    const fetchKey = async () => {
      const sourceConnection = existingConnection || duplicateConnection;
      if (sourceConnection?.name) {
        try {
          const storedKey = await getBigQueryServiceAccountKey(
            sourceConnection.name,
          );
          if (isMounted) {
            setFormState((prev) => ({ ...prev, keyfile: storedKey || '' }));
          }
        } catch (error) {
          if (isMounted) {
            setFormState((prev) => ({ ...prev, keyfile: '' }));
          }
        }
      }
    };
    if (existingConnection || duplicateConnection) {
      fetchKey();
    }
    return () => {
      isMounted = false;
    };
  }, [existingConnection, duplicateConnection, getBigQueryServiceAccountKey]);

  // Get existing connections for name validation
  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );

  // Get real-time validation result for name field
  const nameValidation = validateName(formState.name);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));
    setConnectionStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }

    // Validate keyfile is valid JSON
    try {
      JSON.parse(formState.keyfile);
      setKeyfileError('');
    } catch (err) {
      setKeyfileError(
        'Service account key must be valid JSON. Paste the full JSON, not a filename.',
      );
      toast.error(
        'Service account key must be valid JSON. Paste the full JSON, not a filename.',
      );
      return;
    }

    // Save the service account key in secure storage
    if (formState.name && formState.keyfile) {
      await setBigQueryServiceAccountKey(formState.keyfile, formState.name);
    }
    await setConnectionField('project', formState.project, formState.name);
    await setConnectionField(
      'dataset',
      formState.dataset || formState.schema,
      formState.name,
    );

    if (connection) {
      updateConnection({
        connection: {
          id: connection.id,
          connection: {
            ...formState,
            method: 'service-account', // Always set method
            keyfile: formState.keyfile,
          },
        },
      });
      return;
    }

    configureConnection({
      projectId,
      connection: {
        ...formState,
        method: 'service-account', // Always set method
        database: formState.project,
        schema: formState.dataset,
        keyfile: formState.keyfile,
      },
    });
  };

  const handleTest = async () => {
    // Save the key to secure storage before testing
    if (formState.name && formState.keyfile) {
      await setBigQueryServiceAccountKey(formState.keyfile, formState.name);
    }
    setConnectionStatus('idle');
    testConnection({
      ...formState,
      method: 'service-account', // Always set method
      database: formState.project,
      schema: formState.dataset,
      keyfile: formState.keyfile,
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
        title="BigQuery Connection"
        imageSource={connectionIcons.images.bigquery}
        onClose={onCancel}
        onSave={handleSubmit}
        isLoading={isUpdating || isConfiguring}
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
          onBlur={() => setNameTouched(true)}
          fullWidth
          margin="normal"
          required
          error={nameTouched && !nameValidation.isValid}
          helperText={
            nameTouched && !nameValidation.isValid ? nameValidation.message : ''
          }
        />

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
          error={!!keyfileError}
          helperText={
            keyfileError ||
            'Paste the full contents of your Google Cloud service account key JSON file here.'
          }
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

        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}>
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
