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
  Typography,
  Tabs,
  Tab,
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  ConnectionModel,
  ConnectionTestResult,
  ConnectorTestResponse,
  SnowflakeConnection,
} from '../../../types/backend';
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
    setConnectionField,
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
    authMethod:
      existingConnection?.authMethod ??
      duplicateConnection?.authMethod ??
      'password',
    accountLocator:
      existingConnection?.accountLocator ??
      duplicateConnection?.accountLocator ??
      '',
  });

  const isWebBrowserAuth = formState.authMethod === 'web_browser';

  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
    onMutate: () => {},
    onSuccess: (response: ConnectorTestResponse) => {
      let normalizedResult: ConnectionTestResult;
      if (typeof response === 'boolean') {
        normalizedResult = { ok: response };
      } else if ('ok' in response) {
        normalizedResult = response;
      } else {
        normalizedResult = { ok: response.success };
      }

      if (normalizedResult.ok) {
        toast.success(
          isWebBrowserAuth
            ? 'Snowflake browser authentication succeeded!'
            : 'Connection test successful!',
        );
        setConnectionStatus('success');
        return;
      }

      toast.error(
        normalizedResult.details
          ? `${normalizedResult.message || 'Snowflake connection failed'}: ${normalizedResult.details}`
          : normalizedResult.message || 'Snowflake connection failed',
      );
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

  // Get existing connections for name validation
  const { data: connections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    connections,
    connection?.id,
  );

  React.useEffect(() => {
    let isMounted = true;
    const fetchCredentials = async () => {
      const sourceConnection = existingConnection || duplicateConnection;
      if (sourceConnection) {
        try {
          const storedUsername = await getDatabaseUsername(
            sourceConnection.name,
          );
          const storedPassword = await getDatabasePassword(
            sourceConnection.name,
          );
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              username: storedUsername || '',
              password: storedPassword || '',
            }));
          }
        } catch (error) {
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              username: '',
              password: '',
            }));
          }
        }
      }
    };
    if (existingConnection || duplicateConnection) {
      fetchCredentials();
    }
    return () => {
      isMounted = false;
    };
  }, [
    existingConnection,
    duplicateConnection,
    getDatabaseUsername,
    getDatabasePassword,
  ]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));

    // Reset connection status whenever an input changes
    setConnectionStatus('idle');
  };

  const handleAuthMethodChange = (
    _e: React.SyntheticEvent,
    newValue: string,
  ) => {
    const authMethod = newValue as SnowflakeConnection['authMethod'];
    setFormState((prev) => ({
      ...prev,
      authMethod,
      password: authMethod === 'web_browser' ? '' : prev.password,
    }));
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
    await setDatabasePassword(
      formState.authMethod === 'web_browser' ? '' : formState.password,
      formState.name,
    );
    await setConnectionField('account', formState.account, formState.name);
    await setConnectionField(
      'accountLocator',
      formState.accountLocator || '',
      formState.name,
    );
    await setConnectionField('warehouse', formState.warehouse, formState.name);
    await setConnectionField('dbname', formState.database, formState.name);
    await setConnectionField('schema', formState.schema, formState.name);
    await setConnectionField(
      'role',
      formState.role || 'SYSADMIN',
      formState.name,
    );

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
    if (isWebBrowserAuth) {
      toast.info('Opening Snowflake browser sign-in...');
    }
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

        <Tabs
          value={formState.authMethod || 'password'}
          onChange={handleAuthMethodChange}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Password Login" value="password" />
          <Tab label="Web Browser" value="web_browser" />
        </Tabs>

        {isWebBrowserAuth && (
          <TextField
            label="Account Locator"
            name="accountLocator"
            value={formState.accountLocator || ''}
            onChange={handleChange}
            fullWidth
            required
            placeholder="e.g. GZ12955"
            helperText="Required for Web Browser authentication. Enter your Snowflake Account Locator."
          />
        )}

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
          required
        />

        {!isWebBrowserAuth && (
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
        )}

        {isWebBrowserAuth && (
          <Typography variant="body2" color="text.secondary">
            Snowflake will open your browser for sign-in during connection tests
            and dbt authentication.
          </Typography>
        )}

        <Box
          sx={{
            mt: 3,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            gap: 1,
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
            {isTesting && isWebBrowserAuth && 'Opening Browser...'}
            {isTesting && !isWebBrowserAuth && 'Testing...'}
            {!isTesting && 'Test Connection'}
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
          {isTesting && isWebBrowserAuth && (
            <Typography variant="body2" color="text.secondary">
              Waiting for browser authentication to complete...
            </Typography>
          )}
        </Box>
      </Box>
    </Box>
  );
};
