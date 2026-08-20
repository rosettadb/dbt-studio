import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Box,
  Button,
  CircularProgress,
  IconButton,
  TextField,
} from '@mui/material';
import { FolderOpen } from '@mui/icons-material';
import { ConnectionModel, SQLiteConnection } from '../../../types/backend';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useFilePicker,
  useGetConnections,
  useTestConnection,
  useUpdateConnection,
} from '../../controllers';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import ConnectionHeader from './connection-header';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

function shortSQLitePath(databasePath: string): string {
  return databasePath.split(/[\\/]/).pop() || '';
}

export const SQLite: React.FC<Props> = ({
  onCancel,
  connection,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const { mutate: getFiles } = useFilePicker();
  const existingConnection = connection?.connection as
    | SQLiteConnection
    | undefined;
  const duplicateConnection = duplicateFrom?.connection as
    | SQLiteConnection
    | undefined;
  const [nameTouched, setNameTouched] = React.useState(false);
  const [connectionTested, setConnectionTested] = React.useState(false);
  const [formState, setFormState] = React.useState<SQLiteConnection>({
    type: 'sqlite',
    name: existingConnection?.name ?? suggestedName ?? '',
    database_path:
      existingConnection?.database_path ??
      duplicateConnection?.database_path ??
      '',
    short_database_path: shortSQLitePath(
      existingConnection?.database_path ??
        duplicateConnection?.database_path ??
        '',
    ),
    database:
      existingConnection?.database_path ??
      duplicateConnection?.database_path ??
      '',
    schema: 'main',
  });
  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );
  const nameValidation = validateName(formState.name);
  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: () => {
        toast.success('SQLite connection created successfully!');
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });
  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: () => {
        toast.success('SQLite connection updated successfully!');
        navigate('/app/connections');
      },
      onError: (error) => {
        toast.error(`Update failed: ${error}`);
      },
    });
  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
    onSuccess: (success) => {
      setConnectionTested(success === true);
      if (success) toast.success('SQLite connection test successful!');
      else toast.error('SQLite connection test failed');
    },
    onError: (error) => {
      setConnectionTested(false);
      toast.error(`Test failed: ${error.message}`);
    },
  });

  useEffect(() => {
    setFormState((previous) => ({
      ...previous,
      database: previous.database_path,
      short_database_path: shortSQLitePath(previous.database_path),
    }));
  }, [formState.database_path]);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }
    const connectionData = { ...formState, database: formState.database_path };
    if (connection) {
      updateConnection({
        connection: { id: connection.id, connection: connectionData },
      });
    } else {
      configureConnection({ connection: connectionData });
    }
  };

  const handleFileSelect = () => {
    getFiles(
      {
        properties: ['openFile'],
        filters: [
          { name: 'SQLite databases', extensions: ['db', 'sqlite', 'sqlite3'] },
        ],
      },
      {
        onSuccess: (filePaths) => {
          if (filePaths?.[0]) {
            setConnectionTested(false);
            setFormState((previous) => ({
              ...previous,
              database_path: filePaths[0],
            }));
          }
        },
        onError: () => {
          toast.error('Failed to select SQLite database file');
        },
      },
    );
  };

  const handleTest = () => {
    setConnectionTested(false);
    testConnection({ ...formState, database: formState.database_path });
  };
  const testButtonLabel = connectionTested ? 'Connected' : 'Test Connection';

  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <ConnectionHeader
        title="SQLite Connection"
        imageSource={connectionIcons.images.sqlite}
        onClose={onCancel}
        onSave={handleSubmit}
        isLoading={isUpdating || isConfiguring}
      />
      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{
          maxWidth: 500,
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
          onChange={(event) =>
            setFormState((previous) => ({
              ...previous,
              name: event.target.value,
            }))
          }
          onBlur={() => setNameTouched(true)}
          required
          error={nameTouched && !nameValidation.isValid}
          helperText={
            nameTouched && !nameValidation.isValid ? nameValidation.message : ''
          }
        />
        <TextField
          label="SQLite Database File"
          value={formState.database_path}
          onChange={(event) => {
            setConnectionTested(false);
            setFormState((previous) => ({
              ...previous,
              database_path: event.target.value,
            }));
          }}
          required
          placeholder="/path/to/database.sqlite"
          helperText="Select an existing .db, .sqlite, or .sqlite3 file."
          slotProps={{
            input: {
              endAdornment: (
                <IconButton
                  onClick={handleFileSelect}
                  edge="end"
                  aria-label="Select SQLite database file"
                >
                  <FolderOpen />
                </IconButton>
              ),
            },
          }}
        />
        <Button
          type="button"
          variant="contained"
          onClick={handleTest}
          disabled={isTesting || !formState.database_path}
          startIcon={isTesting ? <CircularProgress size={18} /> : undefined}
          sx={{ alignSelf: 'flex-start' }}
        >
          {isTesting ? 'Testing...' : testButtonLabel}
        </Button>
      </Box>
    </Box>
  );
};
