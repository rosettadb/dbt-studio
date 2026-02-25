import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  IconButton,
  InputAdornment,
  TextField,
  useTheme,
  CircularProgress,
  FormControlLabel,
  Checkbox,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, PostgresConnection } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useTestConnection,
  useUpdateConnection,
  useGetConnections,
} from '../../controllers';
import ConnectionHeader from './connection-header';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

export const Postgres: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    setDatabaseUsername,
    setDatabasePassword,
  } = useSecureStorage();

  const existingConnection = React.useMemo(
    () => connection?.connection as PostgresConnection,
    [connection],
  );

  const duplicateConnection = React.useMemo(
    () => duplicateFrom?.connection as PostgresConnection,
    [duplicateFrom],
  );

  const [formState, setFormState] = React.useState<PostgresConnection>({
    type: existingConnection?.type ?? duplicateConnection?.type ?? 'postgres',
    name: existingConnection?.name ?? suggestedName ?? '',
    host: existingConnection?.host ?? duplicateConnection?.host ?? '',
    port: existingConnection?.port ?? duplicateConnection?.port ?? 5432,
    database:
      existingConnection?.database ?? duplicateConnection?.database ?? '',
    schema:
      existingConnection?.schema ?? duplicateConnection?.schema ?? 'public',
    username: '',
    password: '',
    ssl: existingConnection?.ssl ?? duplicateConnection?.ssl ?? false,
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [nameTouched, setNameTouched] = React.useState(false);

  // Get existing connections for validation
  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );
  const nameValidation = validateName(formState.name);

  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: () => {
        toast.success('PostgreSQL connection updated successfully!');
      },
      onError: (error) => {
        toast.error(`Update failed: ${error}`);
      },
    });

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('PostgreSQL connection created successfully!');
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
  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
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

  React.useEffect(() => {
    const fetchCredentials = async () => {
      const sourceConnection = existingConnection || duplicateConnection;
      if (sourceConnection) {
        const storedUsername = await getDatabaseUsername(sourceConnection.name);
        const storedPassword = await getDatabasePassword(sourceConnection.name);
        setFormState((prev) => ({
          ...prev,
          username: storedUsername || '',
          password: storedPassword || '',
        }));
      }
    };
    if (existingConnection || duplicateConnection) {
      fetchCredentials();
    }
  }, [existingConnection, duplicateConnection]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target as HTMLInputElement;
    const { checked } = e.target as HTMLInputElement;

    let finalValue: string | number | boolean = value;

    if (type === 'checkbox') {
      finalValue = checked;
    } else if (name === 'port') {
      finalValue = Number(value);
    }

    // Update form state
    setFormState((prev) => ({
      ...prev,
      [name]: finalValue,
    }));

    setConnectionStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submission
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      setNameTouched(true);
      return;
    }

    await setDatabaseUsername(formState.username, formState.name);
    await setDatabasePassword(formState.password, formState.name);

    if (connection) {
      updateConnection({
        connection: {
          id: connection.id,
          connection: formState,
        },
      });
      return;
    }
    configureConnection({
      projectId,
      connection: formState,
    });
  };

  const handleTest = () => {
    setConnectionStatus('idle');
    testConnection(formState);
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

  // Replace any nested ternary with a function
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
        title="No name"
        imageSource={connectionIcons.images.postgres}
        onClose={onCancel}
        onSave={handleSubmit}
        isLoading={isUpdating || isConfiguring}
      />
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          width: '100%',
          maxWidth: '500px', // Changed from 800px to 500px
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
            nameTouched && !nameValidation.isValid
              ? nameValidation.message
              : 'Enter a unique name for this connection'
          }
        />

        <TextField
          label="Host"
          name="host"
          value={formState?.host}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Port"
          name="port"
          type="number"
          value={formState?.port}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Database"
          name="database"
          value={formState.database}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Schema"
          name="schema"
          value={formState.schema}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Username"
          name="username"
          value={formState.username}
          onChange={handleChange}
          fullWidth
        />

        <TextField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formState.password}
          onChange={handleChange}
          fullWidth
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword(!showPassword)}
                    onMouseDown={(e) => e.preventDefault()}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            },
          }}
        />

        <FormControlLabel
          control={
            <Checkbox
              name="ssl"
              checked={formState.ssl || false}
              onChange={handleChange}
            />
          }
          label="Enable SSL/TLS (Recommended for production)"
        />

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
              paddingRight: '32px', // Add extra padding on right to accommodate the indicator
              minWidth: '150px', // Ensure button doesn't change size during loading
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
