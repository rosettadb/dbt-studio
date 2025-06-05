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
import {
  DatabricksConnection,
  DatabricksDBTConnection,
} from '../../../types/backend';
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

export const Databricks: React.FC<Props> = ({ onCancel }) => {
  const { data: project } = useGetSelectedProject();
  const navigate = useNavigate();
  const theme = useTheme();

  const existingConnection: DatabricksDBTConnection | undefined =
    React.useMemo(() => {
      if (project) {
        return project.dbtConnection as DatabricksDBTConnection;
      }
      return undefined;
    }, [project]);

  const [formState, setFormState] = React.useState<DatabricksConnection>({
    type: existingConnection?.type ?? 'databricks',
    name: project!.name,
    host: existingConnection?.host ?? '',
    port: existingConnection?.port ?? 443,
    httpPath: existingConnection?.http_path ?? '',
    database: existingConnection?.database ?? '',
    schema: existingConnection?.schema ?? '',
    username: existingConnection?.username ?? '',
    password: existingConnection?.token ?? '', // Using password field for token
  });

  const [showPassword, setShowPassword] = React.useState(false);
  const [isTesting, setIsTesting] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('Databricks connection configured successfully!');
      navigate(`/app/project-details`);
    },
    onError: (error) => {
      toast.error(`Configuration failed: ${error}`);
    },
  });

  const { mutate: testConnection } = useTestConnection({
    onSuccess: (success) => {
      setIsTesting(false);
      if (success) {
        toast.success('Connection test successful!');
        setConnectionStatus('success');
        return;
      }
      toast.error('Connection test failed');
      setConnectionStatus('failed');
    },
    onError: (error) => {
      setIsTesting(false);
      toast.error(`Test failed: ${error.message}`);
      setConnectionStatus('failed');
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: name === 'port' ? Number(value) : value,
    }));

    setConnectionStatus('idle');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!project?.id) return;
    configureConnection({
      projectId: project.id,
      connection: formState,
    });
  };

  const handleTest = () => {
    setIsTesting(true);
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
        title={project?.name || 'Databricks Connection'}
        imageSource={connectionIcons.images.databricks}
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
          label="Username"
          name="username"
          value={formState.username}
          onChange={handleChange}
          fullWidth
          placeholder="Your Databricks username or email"
        />

        <TextField
          label="Access Token"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formState.password}
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