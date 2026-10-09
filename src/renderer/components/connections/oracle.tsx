/* eslint-disable react/jsx-props-no-spreading */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Switch,
  TextField,
  Tab,
  Tabs,
  Typography,
  useTheme,
} from '@mui/material';
import { FolderOpen, Link as LinkIcon, Refresh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { z } from 'zod';
import type { ConnectionModel, OracleConnection } from '../../../types/backend';
import {
  ORACLE_DEFAULT_PORT,
  ORACLE_DEFAULT_TLS_PORT,
  normalizeOracleIdentifier,
  validateOracleConnection,
} from '../../../shared/oracle';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useUpdateConnection,
  useTestConnection,
  useGetConnections,
  useFilePicker,
} from '../../controllers';
import { useOracleWalletAliases } from '../../controllers/connectors.controller';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import ConnectionHeader from './connection-header';

const defaultPort = (tls: boolean) =>
  tls ? ORACLE_DEFAULT_TLS_PORT : ORACLE_DEFAULT_PORT;

const oracleForm = z.custom<OracleConnection>().superRefine((value, ctx) => {
  const error = validateOracleConnection(value);
  if (error) ctx.addIssue({ code: z.ZodIssueCode.custom, message: error });
});

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
  projectId?: string;
};

export const Oracle: React.FC<Props> = ({
  onCancel,
  connection,
  duplicateFrom,
  suggestedName,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const secure = useSecureStorage();
  const source = (connection || duplicateFrom)?.connection as
    | OracleConnection
    | undefined;
  const [form, setForm] = React.useState<OracleConnection>(() => ({
    type: 'oracle',
    connectMode: source?.connectMode || 'basic',
    name: connection?.connection.name || suggestedName || 'Oracle Connection',
    username: source?.username || '',
    password: '',
    database: source?.database || '',
    schema:
      source?.schema && source.schema !== source.schema.toUpperCase()
        ? `"${source.schema.replace(/"/g, '""')}"`
        : source?.schema || '',
    host: source?.host || '',
    port: source?.port || ORACLE_DEFAULT_PORT,
    serviceName: source?.serviceName || '',
    tls: !!source?.tls,
    connectString: source?.connectString || '',
    walletDir: source?.walletDir || '',
  }));
  const [walletPassword, setWalletPassword] = React.useState('');
  const [loadingSecrets, setLoadingSecrets] = React.useState(!!source);
  const [busy, setBusy] = React.useState(false);
  const [connectionStatus, setConnectionStatus] = React.useState<
    'idle' | 'success' | 'failed'
  >('idle');
  const portEdited = React.useRef(!!source);
  const { data: connections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    connections,
    connection?.id,
  );
  const {
    data: aliases = [],
    isFetching: readingAliases,
    error: aliasError,
    refetch,
  } = useOracleWalletAliases(
    form.connectMode === 'wallet' ? form.walletDir : undefined,
  );
  const { mutateAsync: pickFolder } = useFilePicker();
  const saved = () => {
    toast.success('Oracle connection saved');
    navigate('/app/connections');
  };
  const { mutateAsync: configure } = useConfigureConnection({
    onSuccess: saved,
  });
  const { mutateAsync: update } = useUpdateConnection({ onSuccess: saved });
  const { mutateAsync: test, isLoading: testing } = useTestConnection();

  React.useEffect(() => {
    let active = true;
    if (!source)
      return () => {
        active = false;
      };
    const loadCredentials = async () => {
      try {
        const [password, wallet] = await Promise.all([
          secure.getDatabasePassword(source.name),
          secure.getConnectionField('walletpassword', source.name),
        ]);
        if (active) {
          setForm((previous) => ({ ...previous, password: password || '' }));
          setWalletPassword(wallet || '');
        }
      } catch {
        if (active) toast.error('Could not load Oracle credentials');
      } finally {
        if (active) setLoadingSecrets(false);
      }
    };
    loadCredentials();
    return () => {
      active = false;
    };
  }, [source, secure]);

  const change = (
    key: keyof OracleConnection,
    value: string | number | boolean,
  ) => {
    setForm((previous) => ({ ...previous, [key]: value }));
    setConnectionStatus('idle');
  };
  const valid = () => {
    const name = validateName(form.name);
    const parsed = oracleForm.safeParse(form);
    let error = name.isValid ? null : name.message;
    if (name.isValid && !parsed.success) error = parsed.error.issues[0].message;
    if (error) {
      toast.error(error);
      return false;
    }
    return true;
  };
  const persistSecrets = async () => {
    await secure.setDatabaseUsername(form.username, form.name);
    await secure.setDatabasePassword(form.password, form.name);
    await secure.setConnectionField(
      'walletpassword',
      form.connectMode === 'wallet' ? walletPassword : '',
      form.name,
    );
  };
  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || testing || loadingSecrets || !valid()) return;
    setBusy(true);
    try {
      await persistSecrets();
      const payload = { ...form, password: '' };
      if (connection)
        await update({
          connection: { id: connection.id, connection: payload },
        });
      else await configure({ connection: payload });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };
  const handleTest = async () => {
    if (!valid()) return;
    setConnectionStatus('idle');
    try {
      // The wallet password travels in the test payload; it is persisted only
      // by persistSecrets when the user saves.
      const result = await test({
        ...form,
        walletPassword:
          form.connectMode === 'wallet' ? walletPassword : undefined,
        schema: `"${normalizeOracleIdentifier(form.schema || form.username).replace(/"/g, '""')}"`,
      });
      if (result !== true && !(typeof result === 'object' && result.success))
        throw new Error('Connection test failed');
      if (
        typeof result === 'object' &&
        'database' in result &&
        typeof result.database === 'string' &&
        result.database
      ) {
        const { database } = result;
        setForm((previous) => ({ ...previous, database }));
      }
      setConnectionStatus('success');
      toast.success('Oracle connection test successful');
    } catch (error) {
      setConnectionStatus('failed');
      toast.error(error instanceof Error ? error.message : String(error));
    }
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
  const field = (
    key: keyof OracleConnection,
    label: string,
    extra: Record<string, unknown> = {},
  ) => (
    <TextField
      key={key}
      fullWidth
      label={label}
      value={form[key] ?? ''}
      onChange={(event) => {
        if (key === 'port') portEdited.current = true;
        change(
          key,
          key === 'port' ? Number(event.target.value) : event.target.value,
        );
      }}
      {...extra}
    />
  );

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
        title="Oracle Connection"
        imageSource={connectionIcons.images.oracle}
        onClose={onCancel}
        onSave={handleSave}
        isLoading={busy || testing || loadingSecrets}
      />
      <Box
        component="form"
        onSubmit={handleSave}
        sx={{
          width: '100%',
          maxWidth: 500,
          mx: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        {field('name', 'Connection Name', { required: true, margin: 'normal' })}
        <Tabs
          value={form.connectMode}
          onChange={(_event, mode) => {
            if (mode) change('connectMode', mode);
          }}
          aria-label="Oracle connection mode"
          indicatorColor="primary"
          textColor="primary"
          variant="fullWidth"
          sx={{ mb: 1, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Basic" value="basic" />
          <Tab label="String" value="connectString" />
          <Tab label="Wallet" value="wallet" />
        </Tabs>
        {form.connectMode === 'basic' && (
          <>
            {field('host', 'Host', { required: true })}
            {field('port', 'Port', { type: 'number', required: true })}
            {field('serviceName', 'Service name', {
              required: true,
              placeholder: 'FREEPDB1',
            })}
            <FormControlLabel
              label="Enable TLS"
              control={
                <Switch
                  size="small"
                  checked={!!form.tls}
                  onChange={(_event, enabled) => {
                    setForm((previous) => ({
                      ...previous,
                      tls: enabled,
                      port: portEdited.current
                        ? previous.port
                        : defaultPort(enabled),
                    }));
                    setConnectionStatus('idle');
                  }}
                />
              }
            />
          </>
        )}
        {form.connectMode === 'connectString' &&
          field('connectString', 'Connect string', {
            required: true,
            placeholder: 'host:1521/service or (DESCRIPTION=...)',
          })}
        {form.connectMode === 'wallet' && (
          <>
            {field('walletDir', 'Wallet folder', { required: true })}
            <Button
              variant="outlined"
              startIcon={<FolderOpen />}
              onClick={async () => {
                try {
                  const paths = await pickFolder({
                    properties: ['openDirectory'],
                  });
                  if (paths?.[0]) {
                    change('walletDir', paths[0]);
                    change('connectString', '');
                  }
                } catch (error) {
                  toast.error(String(error));
                }
              }}
            >
              Browse
            </Button>
            <TextField
              select
              fullWidth
              label="TNS alias"
              value={
                aliases.includes(form.connectString || '')
                  ? form.connectString
                  : ''
              }
              onChange={(event) => change('connectString', event.target.value)}
              disabled={readingAliases}
            >
              {aliases.map((alias) => (
                <MenuItem key={alias} value={alias} sx={{ gap: 1, py: 0.5 }}>
                  <LinkIcon fontSize="small" />
                  {alias}
                </MenuItem>
              ))}
            </TextField>
            {!!aliasError && (
              <Typography color="error" variant="caption">
                {aliasError instanceof Error
                  ? aliasError.message
                  : String(aliasError)}
              </Typography>
            )}
            <Button
              variant="outlined"
              startIcon={<Refresh />}
              disabled={!form.walletDir || readingAliases}
              onClick={() => {
                refetch();
              }}
            >
              Refresh aliases
            </Button>
            <TextField
              fullWidth
              label="Wallet password (optional)"
              type="password"
              value={walletPassword}
              onChange={(event) => {
                setWalletPassword(event.target.value);
                setConnectionStatus('idle');
              }}
            />
          </>
        )}
        {field('username', 'Username', { required: true })}
        {field('password', 'Password', { type: 'password' })}
        {field('schema', 'Schema', { placeholder: 'defaults to username' })}
        {field('database', 'Database', {
          helperText: 'Filled after a successful test; editable',
        })}
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="button"
            variant="contained"
            color="primary"
            startIcon={
              testing ? (
                <CircularProgress size={20} color="inherit" sx={{ mr: 1 }} />
              ) : null
            }
            onClick={handleTest}
            disabled={testing || busy || loadingSecrets}
            sx={{
              mr: 2,
              position: 'relative',
              paddingRight: '32px',
              minWidth: '150px',
            }}
          >
            {testing ? 'Testing...' : 'Test Connection'}
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
        {connectionStatus === 'success' && (
          <Typography role="status" variant="caption" color="success.main">
            Connection test successful
          </Typography>
        )}
      </Box>
    </Box>
  );
};
