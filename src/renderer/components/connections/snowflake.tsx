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
import { Visibility, VisibilityOff } from '@mui/icons-material'; // Removed Save import
import { toast } from 'react-toastify';
import {
  SnowflakeConnection,
  SnowflakeDBTConnection,
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

export const Snowflake: React.FC<Props> = ({ onCancel }) => {
  const { data: project } = useGetSelectedProject();
  const navigate = useNavigate();
  const theme = useTheme();

  const existingConnection: SnowflakeDBTConnection | undefined =
    React.useMemo(() => {
      if (project) {
        return project.dbtConnection as SnowflakeDBTConnection;
      }
      return undefined;
    }, [project]);

  const [isTesting, setIsTesting] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const [showPassword, setShowPassword] = React.useState(false);

  const [formState, setFormState] = React.useState<SnowflakeConnection>({
    type: 'snowflake',
    name: project?.name || 'Snowflake Connection',
    account: existingConnection?.account ?? '',
    warehouse: existingConnection?.warehouse ?? '',
    database: existingConnection?.database ?? '',
    schema: existingConnection?.schema ?? '',
    username: existingConnection?.username ?? '',
    password: existingConnection?.password ?? '',
    role: 'SYSADMIN',
  });

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('Snowflake connection configured successfully!');
      navigate(`/app/project-details`);
    },
    onError: (error) => {
      toast.error(`Configuration failed: ${error}`);
    },
  });

  const { mutate: testConnection } = useTestConnection({
    onSuccess: (success) => {
      if (success) {
        toast.success('Connection test successful!');
        setConnectionStatus('success');
        setIsTesting(false);
        return;
      }
      toast.error('Connection test failed');
      setConnectionStatus('failed');
      setIsTesting(false);
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setConnectionStatus('failed');
      setIsTesting(false);
    },
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({ ...prev, [name]: value }));

    // Reset connection status whenever an input changes
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
        return '#9e9e9e'; // silver/grey for idle state
    }
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
        title={project?.name || 'Snowflake Connection'}
        imageSource={connectionIcons.images.snowflake}
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
