import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import {
  Box,
  Button,
  TextField,
  useTheme,
  CircularProgress,
  IconButton,
  Typography,
} from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import { ConnectionModel, DuckDBConnection } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useTestConnection,
  useFilePicker,
  useUpdateConnection,
  useGetConnections,
} from '../../controllers';
import ConnectionHeader from './connection-header';
import { useConnectionNameValidation } from '../../utils/connectionValidation';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
};

function shortDuckdbPath(databasePath: string): string {
  // Get the base filename from the full path
  // Example /Users/nurilacka/sample_01.duckdb you would get sample_01 without the .duckdb extension
  const baseName = databasePath.split('/').pop() || '';
  return baseName.replace(/\.duckdb$/, '');
}

export const DuckDB: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
}) => {
  const navigate = useNavigate();
  const theme = useTheme();

  const { mutate: getFiles } = useFilePicker();

  const existingConnection = React.useMemo(
    () => connection?.connection as DuckDBConnection,
    [connection],
  );

  const [formState, setFormState] = React.useState<DuckDBConnection>({
    type: 'duckdb',
    name: existingConnection?.name || 'DuckDB Connection',
    database_path: existingConnection?.database_path || '',
    database: existingConnection?.database || 'main',
    schema: 'main',
    short_database_path: existingConnection?.database_path
      ? shortDuckdbPath(existingConnection.database_path)
      : '',
  });

  const [isTesting, setIsTesting] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');

  const { mutate: updateConnection } = useUpdateConnection({
    onSuccess: () => {
      toast.success('DuckDB connection updated successfully!');
    },
    onError: (error) => {
      toast.error(`Update failed: ${error}`);
    },
  });

  const { mutate: configureConnection } = useConfigureConnection({
    onSuccess: () => {
      toast.success('DuckDB connection configured successfully!');
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
      // Check if it's a locked database error
      if (error.message?.includes('locked by another process')) {
        const pidMatch = error.message.match(/PID: (\d+)/);
        const pid = pidMatch ? pidMatch[1] : 'unknown';

        // Custom toast with kill command
        toast.error(
          <Box>
            <Typography>
              Database is locked by another process, pid {pid}.
            </Typography>
            <Typography>Close any open DuckDB CLI sessions.</Typography>
          </Box>,
        );
      } else {
        toast.error(`Test failed: ${error.message}`);
      }
      setConnectionStatus('failed');
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: value,
    }));

    setConnectionStatus('idle');
  };

  const handleFileSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths && filePaths.length > 0) {
            const selectedPath = filePaths[0];
            setFormState((prev) => ({
              ...prev,
              database_path: selectedPath,
              database: selectedPath,
            }));
            setConnectionStatus('idle');
          }
        },
        onError: () => {
          toast.error('Failed to select database file');
        },
      },
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate connection name before submitting
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }

    const connectionData = {
      ...formState,
      database: formState.database_path,
    };

    if (connection) {
      updateConnection({
        connection: {
          id: connection.id,
          connection: connectionData,
        },
      });
      return;
    }
    configureConnection({
      projectId,
      connection: connectionData,
    });
  };

  const handleTest = () => {
    const connectionData = {
      ...formState,
      database: formState.database_path,
    };
    testConnection(connectionData);
  };

  useEffect(() => {
    // Update short path whenever database_path changes
    setFormState((prev) => ({
      ...prev,
      short_database_path: shortDuckdbPath(prev.database_path),
    }));
  }, [formState.database_path]);

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
        title="DuckDB Connection"
        imageSource={connectionIcons.images.duckdb}
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
          error={!nameValidation.isValid}
          helperText={!nameValidation.isValid ? nameValidation.message : ''}
        />

        <TextField
          label="Database File Path"
          name="database_path"
          value={formState.database_path}
          onChange={handleChange}
          fullWidth
          required
          placeholder="/path/to/your/database.duckdb"
          helperText="Path to your DuckDB database file"
          sx={{ mb: 2 }}
          slotProps={{
            input: {
              endAdornment: (
                <IconButton onClick={handleFileSelect} edge="end">
                  <FolderOpen />
                </IconButton>
              ),
            },
          }}
        />

        <TextField
          label="Schema"
          name="schema"
          value={formState.schema}
          onChange={handleChange}
          fullWidth
          helperText="DuckDB schema (default: main)"
          disabled
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
            disabled={isTesting || !formState.database_path}
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
