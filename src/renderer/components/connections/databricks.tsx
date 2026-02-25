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
} from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, DatabricksConnection } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useUpdateConnection,
  useTestConnection,
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

export const Databricks: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();
  const { getDatabaseToken, setDatabaseToken } = useSecureStorage();

  const existingConnection = React.useMemo(
    () => connection?.connection as DatabricksConnection,
    [connection],
  );

  const duplicateConnection = React.useMemo(
    () => duplicateFrom?.connection as DatabricksConnection,
    [duplicateFrom],
  );

  const [formState, setFormState] = React.useState<DatabricksConnection>({
    type: existingConnection?.type ?? duplicateConnection?.type ?? 'databricks',
    name: existingConnection?.name ?? suggestedName ?? '',
    host: existingConnection?.host ?? duplicateConnection?.host ?? '',
    port: existingConnection?.port ?? duplicateConnection?.port ?? 443,
    httpPath:
      existingConnection?.httpPath ?? duplicateConnection?.httpPath ?? '',
    database:
      existingConnection?.database ?? duplicateConnection?.database ?? '',
    schema: existingConnection?.schema ?? duplicateConnection?.schema ?? '',
    token: '',
  });

  const [showToken, setShowToken] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [nameTouched, setNameTouched] = React.useState(false);

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
        toast.success('Databricks connection configured successfully!');
        if (projectId) {
          navigate('/app');
          return;
        }
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error.message}`);
      },
    });

  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: () => {
        toast.success('Databricks connection updated successfully!');
      },
      onError: (error) => {
        toast.error(`Update failed: ${error.message}`);
      },
    });

  // Get existing connections for name validation
  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );

  // Get real-time validation result for name field
  const nameValidation = validateName(formState.name);

  React.useEffect(() => {
    let isMounted = true;
    const fetchCredentials = async () => {
      const sourceConnection = existingConnection || duplicateConnection;
      if (sourceConnection) {
        try {
          const storedToken = await getDatabaseToken(sourceConnection.name);
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              token: storedToken || '',
            }));
          }
        } catch (error) {
          if (isMounted) {
            setFormState((prev) => ({
              ...prev,
              token: '',
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
  }, [existingConnection, duplicateConnection, getDatabaseToken]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: name === 'port' ? Number(value) : value,
    }));

    setConnectionStatus('idle');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }

    await setDatabaseToken(formState.token, formState.name);

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
        title="Databricks Connection"
        imageSource={connectionIcons.images.databricks}
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
          label="Host"
          name="host"
          value={formState.host}
          onChange={handleChange}
          fullWidth
          required
          placeholder="dbc-xxxxxxxx-xxxx.cloud.databricks.com"
          helperText="Your Databricks workspace URL without https://"
        />

        <TextField
          label="Port"
          name="port"
          type="number"
          value={formState.port}
          onChange={handleChange}
          fullWidth
          required
        />

        <TextField
          label="HTTP Path"
          name="httpPath"
          value={formState.httpPath}
          onChange={handleChange}
          fullWidth
          required
          placeholder="/sql/1.0/warehouses/xxxxxxxxx"
          helperText="SQL warehouse HTTP path from connection details"
        />

        <TextField
          label="Database"
          name="database"
          value={formState.database}
          onChange={handleChange}
          fullWidth
          required
          placeholder="workspace"
          helperText="Catalog name in Databricks (maps to database in dbt)"
        />

        <TextField
          label="Schema"
          name="schema"
          value={formState.schema}
          onChange={handleChange}
          fullWidth
          required
          placeholder="demo_retail"
          helperText="Schema name within the database/catalog (e.g., demo_retail, default, information_schema, etc.)"
        />

        <TextField
          label="Access Token"
          name="token"
          type={showToken ? 'text' : 'password'}
          value={formState.token}
          onChange={handleChange}
          fullWidth
          required
          placeholder="dapi..."
          helperText="Personal access token from Databricks workspace"
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowToken(!showToken)}
                    onMouseDown={(e) => e.preventDefault()}
                    edge="end"
                  >
                    {showToken ? <VisibilityOff /> : <Visibility />}
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
