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
  Tooltip,
} from '@mui/material';
import { Visibility, VisibilityOff, HelpOutline } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, KineticaConnection } from '../../../types/backend';
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
};

export const Kinetica: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
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
    () => connection?.connection as KineticaConnection,
    [connection],
  );

  const [formState, setFormState] = React.useState<KineticaConnection>({
    type: 'kinetica',
    name: existingConnection?.name ?? '',
    host: existingConnection?.host ?? '',
    port: existingConnection?.port ?? 9191,
    database: existingConnection?.database ?? 'public', // Default schema/db concept can be vague in Kinetica/GPUdb but 'public' is safe placeholder or user input
    schema: existingConnection?.schema ?? '',
    username: '',
    password: '',
    useSSL: existingConnection?.useSSL ?? false,
    bypassSslCertCheck: existingConnection?.bypassSslCertCheck ?? false,
    timeout: existingConnection?.timeout ?? 30000,
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
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

  const { mutate: updateConnection } = useUpdateConnection({
    onSuccess: () => {
      toast.success('Kinetica connection updated successfully!');
    },
    onError: (error) => {
      toast.error(`Update failed: ${error}`);
    },
  });

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('Kinetica connection created successfully!');
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
  const { mutate: testConnection } = useTestConnection({
    onMutate: () => {
      // eslint-disable-next-line no-console
      console.log('Test Connection: Started');
      setIsTesting(true);
      setConnectionStatus('idle');
    },
    onSettled: () => {
      // eslint-disable-next-line no-console
      console.log('Test Connection: Settled');
      setIsTesting(false);
    },
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
      const storedUsername = await getDatabaseUsername(
        existingConnection?.name,
      );
      const storedPassword = await getDatabasePassword(
        existingConnection?.name,
      );
      setFormState((prev) => ({
        ...prev,
        username: storedUsername || '',
        password: storedPassword || '',
      }));
    };
    if (existingConnection) {
      fetchCredentials();
    }
  }, [existingConnection]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked, type } = e.target;

    // Update form state
    setFormState((prev) => {
      let newValue: string | number | boolean = value;
      let newPort = prev.port;

      if (type === 'checkbox') {
        newValue = checked;
        if (name === 'useSSL') {
          // Auto-switch port if it's currently at the default of the other protocol
          if (checked && prev.port === 9191) {
            newPort = 443;
          } else if (!checked && prev.port === 443) {
            newPort = 9191;
          }
        }
      } else if (name === 'port' || name === 'timeout') {
        newValue = Number(value);
        newPort = Number(value);
      }

      return {
        ...prev,
        [name]: newValue,
        port: name === 'port' ? Number(newValue) : newPort,
      };
    });

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
    // eslint-disable-next-line no-console
    console.log('Test Button Clicked', formState);
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
        imageSource={connectionIcons.images.kinetica}
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
          label="Host / URL"
          name="host"
          value={formState?.host}
          onChange={handleChange}
          fullWidth
          required
          placeholder="e.g. 192.168.1.100 or my-kinetica.com/cluster.../gpudb-0"
          helperText="For Kinetica Cloud, include the full path (e.g. /clusterXXXX/gpudb-0)"
        />

        <TextField
          label="Port"
          name="port"
          type="number"
          value={formState?.port}
          onChange={handleChange}
          fullWidth
          required
          placeholder="Default: 9191 (HTTP), 8082 (HTTPS), or 443 (Cloud)"
        />

        <Box sx={{ display: 'flex', gap: 2 }}>
          <TextField
            label="Database (Optional)"
            name="database"
            value={formState.database}
            onChange={handleChange}
            fullWidth
            placeholder="Default system database"
          />

          <TextField
            label="Schema (Optional)"
            name="schema"
            value={formState.schema}
            onChange={handleChange}
            fullWidth
            placeholder="Default user schema"
          />
        </Box>

        <TextField
          label="Username"
          name="username"
          value={formState.username}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formState.password}
          onChange={handleChange}
          fullWidth
          required
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
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                checked={formState.useSSL}
                onChange={handleChange}
                name="useSSL"
                color="primary"
              />
            }
            label={
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                Use SSL (HTTPS)
                <Tooltip title="Enable if your Kinetica instance is running on HTTPS (usually port 8082)">
                  <HelpOutline
                    sx={{ fontSize: 16, ml: 0.5, color: 'text.secondary' }}
                  />
                </Tooltip>
              </Box>
            }
          />

          {formState.useSSL && (
            <FormControlLabel
              control={
                <Checkbox
                  checked={formState.bypassSslCertCheck}
                  onChange={handleChange}
                  name="bypassSslCertCheck"
                  color="warning"
                />
              }
              label="Bypass SSL Cert Check"
            />
          )}
        </Box>

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
