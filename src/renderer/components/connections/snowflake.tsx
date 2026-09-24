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
  Tabs,
  Tab,
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
  useHasSnowflakeToken,
  useRevokeSnowflakeToken,
} from '../../controllers';
import {
  startSnowflakeAuth,
  cancelSnowflakeAuth,
  onSnowflakeAuthEvent,
} from '../../services/connectors.service';
import ConnectionHeader from './connection-header';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import BrowserAuthenticationGate from './BrowserAuthenticationGate';

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
  });

  const [gateState, setGateState] = React.useState<{
    open: boolean;
    status: any;
    error?: string;
    correlationId?: string;
  }>({
    open: false,
    status: 'idle',
  });

  // Tracks the in-flight OAuth attempt so duplicate Test clicks are ignored
  // and unmount/route-change can cancel before disposing local state.
  const activeCorrelationIdRef = React.useRef<string | undefined>(undefined);

  const validateOAuthFields = (): string | null => {
    if (!formState.account.trim()) return 'Account identifier is required.';
    if (!formState.username.trim()) return 'Username is required.';
    if (!formState.warehouse.trim()) return 'Warehouse is required.';
    if (!formState.database.trim()) return 'Database is required.';
    if (!formState.schema.trim()) return 'Schema is required.';
    if (!formState.role?.trim()) return 'Role is required.';
    return null;
  };

  React.useEffect(() => {
    const unsub = onSnowflakeAuthEvent((payload) => {
      setGateState((prev) => {
        if (prev.correlationId !== payload.correlationId) return prev;
        return {
          ...prev,
          status: payload.status,
          error: payload.error,
        };
      });
    });
    return () => {
      unsub();
      // Idempotent cleanup: cancel any in-flight attempt on unmount so an
      // old callback cannot unlock a new attempt.
      if (activeCorrelationIdRef.current) {
        cancelSnowflakeAuth(activeCorrelationIdRef.current).catch(
          () => undefined,
        );
        activeCorrelationIdRef.current = undefined;
      }
    };
  }, []);

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

  const { data: hasToken, refetch: refetchHasToken } = useHasSnowflakeToken();
  const { mutate: revokeToken, isLoading: isRevoking } =
    useRevokeSnowflakeToken();

  const handleRevokeToken = () => {
    revokeToken(formState.name, {
      onSuccess: (success) => {
        if (success) {
          toast.success(
            'Snowflake cached token revoked. You will be prompted to log in again.',
          );
          refetchHasToken();
        } else {
          toast.error('Failed to revoke token. Cache file might not exist.');
        }
      },
      onError: (err) => {
        toast.error(`Error revoking token: ${(err as Error).message}`);
      },
    });
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    const nameValidation = validateName(formState.name);
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }

    // OAuth mode must never persist a password: tokens stay in the SDK
    // temporary credential cache, never in secure storage / files / logs.
    if (formState.authMethod === 'oauth_browser') {
      if (connectionStatus !== 'success') {
        toast.error('Test the browser connection successfully before saving.');
        return;
      }
      const oauthError = validateOAuthFields();
      if (oauthError) {
        toast.error(oauthError);
        return;
      }
      await setDatabaseUsername(formState.username, formState.name);
    } else {
      await setDatabaseUsername(formState.username, formState.name);
      await setDatabasePassword(formState.password, formState.name);
    }
    await setConnectionField('account', formState.account, formState.name);
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

  const handleTest = async () => {
    setConnectionStatus('idle');
    if (formState.authMethod === 'oauth_browser') {
      // Single-flight guard: ignore duplicate Test clicks while the gate
      // (modal) is already blocking for an active attempt.
      if (gateState.open || activeCorrelationIdRef.current) {
        return;
      }
      const oauthError = validateOAuthFields();
      if (oauthError) {
        toast.error(oauthError);
        return;
      }
      const correlationId = crypto.randomUUID();
      activeCorrelationIdRef.current = correlationId;
      setGateState({ open: true, status: 'started', correlationId });
      try {
        const result: any = await startSnowflakeAuth({
          correlationId,
          account: formState.account.trim(),
          username: formState.username.trim(),
          warehouse: formState.warehouse.trim(),
          database: formState.database.trim(),
          schema: formState.schema.trim(),
          role: formState.role?.trim() || '',
        });
        if (activeCorrelationIdRef.current !== correlationId) return;
        if (result.ok) {
          toast.success(
            'Connection test successful. Snowflake may reuse a cached OAuth session without opening the browser.',
          );
          setConnectionStatus('success');
        } else {
          toast.error(`Test failed: ${result.message}`);
          setConnectionStatus('failed');
        }
      } catch (err: any) {
        if (activeCorrelationIdRef.current !== correlationId) return;
        toast.error(`Test failed: ${err.message}`);
        setConnectionStatus('failed');
        setGateState((prev) => ({
          ...prev,
          status: 'failed',
          error: err.message,
        }));
      } finally {
        if (activeCorrelationIdRef.current === correlationId) {
          activeCorrelationIdRef.current = undefined;
        }
      }
    } else {
      testConnection(formState);
    }
  };

  const handleCancelAuth = () => {
    const correlationId =
      activeCorrelationIdRef.current ?? gateState.correlationId;
    if (correlationId) {
      cancelSnowflakeAuth(correlationId).catch(() => undefined);
      activeCorrelationIdRef.current = undefined;
    }
    setGateState((prev) => ({ ...prev, open: false }));
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

      <BrowserAuthenticationGate
        open={gateState.open}
        status={gateState.status}
        onCancel={handleCancelAuth}
        error={gateState.error}
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
          onChange={(e, val) => {
            setConnectionStatus('idle');
            setFormState((prev) => ({ ...prev, authMethod: val }));
          }}
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Password Login" value="password" />
          <Tab label="Web Browser" value="oauth_browser" />
        </Tabs>

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

        {formState.authMethod !== 'oauth_browser' && (
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
            disabled={isTesting || gateState.open}
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

          {formState.authMethod === 'oauth_browser' && hasToken && (
            <Button
              type="button"
              variant="outlined"
              color="error"
              onClick={handleRevokeToken}
              disabled={isRevoking || isTesting}
              sx={{ ml: 'auto' }}
            >
              {isRevoking ? 'Revoking...' : 'Revoke Token'}
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};
