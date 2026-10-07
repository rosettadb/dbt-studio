import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Cable,
  CheckCircle,
  Error as ErrorIcon,
  FolderOpen,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { ConnectionModel, Db2Connection } from '../../../types/backend';
import {
  DB2_DEFAULT_PORT,
  DB2_DEFAULT_SSL_PORT,
  Db2FieldName,
  validateDb2Fields,
} from '../../../shared/db2';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useFilePicker,
  useGetConnections,
  useTestConnection,
  useUpdateConnection,
} from '../../controllers';
import ConnectionHeader from './connection-header';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

type Status = 'idle' | 'success' | 'failed';

export const Db2: React.FC<Props> = ({
  onCancel,
  connection,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    setDatabaseUsername,
    setDatabasePassword,
  } = useSecureStorage();

  const existing = connection?.connection as Db2Connection | undefined;
  const source = existing ?? (duplicateFrom?.connection as Db2Connection);

  const [formState, setFormState] = React.useState<Db2Connection>({
    type: 'db2',
    name: existing?.name ?? suggestedName ?? '',
    host: source?.host ?? '',
    port: source?.port ?? DB2_DEFAULT_PORT,
    database: source?.database ?? '',
    schema: source?.schema ?? '',
    username: source?.username ?? '',
    password: '',
    ssl: source?.ssl ?? false,
    sslCaPath: source?.sslCaPath ?? '',
  });
  const [portTouched, setPortTouched] = React.useState(Boolean(source));
  const [touched, setTouched] = React.useState<Set<Db2FieldName>>(new Set());
  const [showAllErrors, setShowAllErrors] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [status, setStatus] = React.useState<Status>('idle');
  const [nameTouched, setNameTouched] = React.useState(false);

  const { data: existingConnections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existingConnections,
    connection?.id,
  );
  const nameValidation = validateName(formState.name);

  const fieldErrors = React.useMemo(() => {
    const errors = new Map<Db2FieldName, string>();
    validateDb2Fields(formState).forEach(({ field, message }) => {
      if (!errors.has(field)) errors.set(field, message);
    });
    return errors;
  }, [formState]);

  const errorFor = (field: Db2FieldName) =>
    showAllErrors || touched.has(field) ? fieldErrors.get(field) : undefined;

  const touch = (field: Db2FieldName) =>
    setTouched((prev) => new Set(prev).add(field));

  // Load stored credentials when editing or duplicating.
  React.useEffect(() => {
    if (!source) return undefined;
    let mounted = true;
    (async () => {
      try {
        const [storedUsername, storedPassword] = await Promise.all([
          getDatabaseUsername(source.name),
          getDatabasePassword(source.name),
        ]);
        if (mounted) {
          setFormState((prev) => ({
            ...prev,
            username: storedUsername || prev.username,
            password: storedPassword || '',
          }));
        }
      } catch {
        // Leave the fields for the user to fill in.
      }
    })();
    return () => {
      mounted = false;
    };
    // Only when the source connection changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.name]);

  const onSaved = (verb: string) => () => {
    toast.success(`Db2 connection ${verb} successfully!`);
    navigate('/app/connections');
  };

  const { mutate: updateConnection, isLoading: isUpdating } =
    useUpdateConnection({
      onSuccess: onSaved('updated'),
      onError: (error) => {
        toast.error(`Update failed: ${error}`);
      },
    });

  const { mutate: configureConnection, isLoading: isConfiguring } =
    useConfigureConnection({
      onSuccess: onSaved('created'),
      onError: (error) => {
        toast.error(`Configuration failed: ${error}`);
      },
    });

  const { mutate: testConnection, isLoading: isTesting } = useTestConnection({
    onSuccess: (success) => {
      if (success) {
        toast.success('Connection test successful!');
        setStatus('success');
        return;
      }
      toast.error('Connection test failed');
      setStatus('failed');
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
      setStatus('failed');
    },
  });

  const { mutate: pickFiles } = useFilePicker();

  const update = (patch: Partial<Db2Connection>) => {
    setFormState((prev) => ({ ...prev, ...patch }));
    setStatus('idle');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'port') {
      setPortTouched(true);
      update({ port: Number(value) });
      return;
    }
    update({ [name]: value } as Partial<Db2Connection>);
  };

  const handleSslChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ssl = e.target.checked;
    const patch: Partial<Db2Connection> = { ssl };
    if (!portTouched) {
      patch.port = ssl ? DB2_DEFAULT_SSL_PORT : DB2_DEFAULT_PORT;
    }
    update(patch);
  };

  const handleCertificateSelect = () => {
    pickFiles(
      { properties: ['openFile'] },
      {
        onSuccess: (filePaths) => {
          if (filePaths?.length) {
            touch('sslCaPath');
            update({ sslCaPath: filePaths[0] });
          }
        },
        onError: () => {
          toast.error('Failed to select certificate file');
        },
      },
    );
  };

  const normalized = (): Db2Connection => ({
    ...formState,
    host: formState.host.trim(),
    database: formState.database.trim(),
    schema: formState.schema?.trim() ?? '',
    sslCaPath: formState.ssl
      ? formState.sslCaPath?.trim() || undefined
      : undefined,
  });

  const checkFields = (): boolean => {
    if (fieldErrors.size === 0) return true;
    setShowAllErrors(true);
    toast.error(fieldErrors.values().next().value as string);
    return false;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      setNameTouched(true);
      return;
    }
    if (!checkFields()) return;

    const next = normalized();
    await setDatabaseUsername(next.username, next.name);
    await setDatabasePassword(next.password, next.name);
    // The password lives only in secure storage, never in the connection list.
    const toStore: Db2Connection = { ...next, password: '' };

    if (connection) {
      updateConnection({
        connection: { id: connection.id, connection: toStore },
      });
      return;
    }
    configureConnection({ connection: toStore });
  };

  const handleTest = () => {
    if (!checkFields()) return;
    setStatus('idle');
    testConnection(normalized());
  };

  const testIcon = () => {
    if (isTesting) return <CircularProgress size={16} color="inherit" />;
    if (status === 'success') return <CheckCircle />;
    if (status === 'failed') return <ErrorIcon />;
    return <Cable />;
  };

  const testColor = () => {
    if (status === 'success') return 'success';
    if (status === 'failed') return 'error';
    return 'primary';
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
        imageSource={connectionIcons.images.db2}
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
        <Typography variant="body2" color="text.secondary">
          IBM Db2 for Linux, UNIX and Windows 11.1 or later, including Db2 on
          Cloud. Available in the SQL Editor and Notebooks; not a dbt
          connection.
        </Typography>

        <TextField
          label="Connection Name"
          name="name"
          value={formState.name}
          onChange={handleChange}
          onBlur={() => setNameTouched(true)}
          fullWidth
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
          value={formState.host}
          onChange={handleChange}
          onBlur={() => touch('host')}
          fullWidth
          required
          placeholder="db2.example.com"
          error={Boolean(errorFor('host'))}
          helperText={errorFor('host')}
        />

        <TextField
          label="Port"
          name="port"
          type="number"
          value={formState.port}
          onChange={handleChange}
          onBlur={() => touch('port')}
          fullWidth
          required
          error={Boolean(errorFor('port'))}
          helperText={
            errorFor('port') ??
            `Usually ${DB2_DEFAULT_PORT}, or ${DB2_DEFAULT_SSL_PORT} with SSL`
          }
        />

        <TextField
          label="Database"
          name="database"
          value={formState.database}
          onChange={handleChange}
          onBlur={() => touch('database')}
          fullWidth
          required
          placeholder="TESTDB"
          error={Boolean(errorFor('database'))}
          helperText={
            errorFor('database') ?? 'Up to 8 characters, for example BLUDB'
          }
        />

        <TextField
          label="Schema (optional)"
          name="schema"
          value={formState.schema}
          onChange={handleChange}
          onBlur={() => touch('schema')}
          fullWidth
          error={Boolean(errorFor('schema'))}
          helperText={
            errorFor('schema') ??
            'Default schema for unqualified names. Case-sensitive: Db2 stores unquoted names in uppercase.'
          }
        />

        <TextField
          label="Username"
          name="username"
          value={formState.username}
          onChange={handleChange}
          onBlur={() => touch('username')}
          fullWidth
          required
          error={Boolean(errorFor('username'))}
          helperText={errorFor('username')}
        />

        <TextField
          label="Password"
          name="password"
          type={showPassword ? 'text' : 'password'}
          value={formState.password}
          onChange={handleChange}
          onBlur={() => touch('password')}
          fullWidth
          error={Boolean(errorFor('password'))}
          helperText={errorFor('password')}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                      onMouseDown={(e) => e.preventDefault()}
                      edge="end"
                    >
                      {showPassword ? (
                        <VisibilityOff fontSize="small" />
                      ) : (
                        <Visibility fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
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
              onChange={handleSslChange}
            />
          }
          label="Use SSL/TLS (required for Db2 on Cloud)"
        />

        {formState.ssl && (
          <TextField
            label="CA Certificate (optional)"
            name="sslCaPath"
            value={formState.sslCaPath || ''}
            onChange={handleChange}
            onBlur={() => touch('sslCaPath')}
            fullWidth
            placeholder="/path/to/db2-ca.arm"
            error={Boolean(errorFor('sslCaPath'))}
            helperText={
              errorFor('sslCaPath') ??
              'Certificate that signed the server certificate. Leave empty if it is signed by a public CA.'
            }
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip title="Browse for certificate file">
                      <IconButton
                        size="small"
                        onClick={handleCertificateSelect}
                        edge="end"
                      >
                        <FolderOpen fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              },
            }}
          />
        )}

        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="button"
            variant="contained"
            color={testColor()}
            onClick={handleTest}
            disabled={isTesting}
            startIcon={testIcon()}
          >
            {isTesting ? 'Testing...' : 'Test Connection'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
