import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  useTheme,
  CircularProgress,
  IconButton,
  InputAdornment,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, SnowflakeConnection } from '../../../types/backend';
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

export const Snowflake: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    setDatabaseUsername,
    setDatabasePassword,
  } = useSecureStorage();

  const existingConnection = React.useMemo(
    () => connection?.connection as SnowflakeConnection,
    [connection],
  );

  const duplicateConnection = React.useMemo(
    () => duplicateFrom?.connection as SnowflakeConnection,
    [duplicateFrom],
  );

  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [showPassword, setShowPassword] = React.useState(false);
  const [nameTouched, setNameTouched] = React.useState(false);

  const [formState, setFormState] = React.useState<SnowflakeConnection>({
    type: 'snowflake',
    name: existingConnection?.name ?? suggestedName ?? 'Snowflake Connection',
    account: existingConnection?.account ?? duplicateConnection?.account ?? '',
    warehouse:
      existingConnection?.warehouse ?? duplicateConnection?.warehouse ?? '',
    database:
      existingConnection?.database ?? duplicateConnection?.database ?? '',
    schema: existingConnection?.schema ?? duplicateConnection?.schema ?? '',
    username: '',
    password: '',
    role: existingConnection?.role ?? duplicateConnection?.role ?? 'SYSADMIN',
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

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('Snowflake connection configured successfully!');
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
        toast.success('Snowflake connection updated successfully!');
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });

  // Get existing connections for name validation
  const { data: connections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    connections,
    connection?.id,
  );

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));

    // Reset connection status whenever an input changes
    setConnectionStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    const nameValidation = validateName(formState.name);
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
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

  // Get real-time validation result for name field
  const nameValidation = validateName(formState.name);

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
        title="Snowflake Connection"
        imageSource={connectionIcons.images.snowflake}
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
          label="Account Identifier"
          name="account"
          value={formState.account}
          onChange={handleChange}
          fullWidth
          required
          placeholder="xy12345.us-east-2.aws"
        />

        <TextField
          label="Warehouse"
          name="warehouse"
          value={formState.warehouse}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Role"
          name="role"
          value={formState.role}
          onChange={handleChange}
          fullWidth
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
            startIcon={
              isTesting ? (
                <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
              ) : null
            }
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
