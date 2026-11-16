import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
  useTheme,
} from '@mui/material';
import { toast } from 'react-toastify';
import type { ConnectionModel } from '../../types/backend';
import connectionIcons from '../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useGetConnections,
  useTestConnection,
  useUpdateConnection,
} from '../../renderer/controllers';
import useSecureStorage from '../../renderer/hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../renderer/utils/connectionValidation';
import ConnectionHeader from '../../renderer/components/connections/connection-header';
import type { SpannerAuthMethod, SpannerConnection } from './spanner.shared';
import {
  DEFAULT_SPANNER_EMULATOR_HOST,
  validateSpannerEmulatorHost,
  validateSpannerIds,
  validateSpannerKeyJson,
} from './spanner.helpers.shared';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

const KEY_FIELD = 'spanner';

export const Spanner: React.FC<Props> = ({
  onCancel,
  connection,
  duplicateFrom,
  suggestedName,
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const secure = useSecureStorage();
  const source = (connection || duplicateFrom)?.connection as
    | SpannerConnection
    | undefined;
  const previous = connection?.connection as SpannerConnection | undefined;

  const [form, setForm] = React.useState<SpannerConnection>(() => ({
    type: 'spanner',
    name: connection?.connection.name || suggestedName || '',
    username: source?.project || '',
    password: '',
    project: source?.project || '',
    instance: source?.instance || '',
    database: source?.database || '',
    schema: source?.schema || '',
    authMethod: source?.authMethod || 'adc',
    emulatorHost: source?.emulatorHost || DEFAULT_SPANNER_EMULATOR_HOST,
  }));
  const [keyJson, setKeyJson] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [nameTouched, setNameTouched] = React.useState(false);
  const [status, setStatus] = React.useState<'idle' | 'success' | 'failed'>(
    'idle',
  );

  const { data: connections = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    connections,
    connection?.id,
  );
  const nameValidation = validateName(form.name);
  const { mutateAsync: configure } = useConfigureConnection();
  const { mutateAsync: update } = useUpdateConnection();
  const { mutateAsync: test, isLoading: testing } = useTestConnection();

  // On edit or duplicate, load the saved service-account key.
  React.useEffect(() => {
    if (!source?.name || source.authMethod !== 'service-account')
      return undefined;
    let active = true;
    secure
      .getConnectionField(KEY_FIELD, source.name)
      .then((key) => active && setKeyJson(key || ''))
      .catch(() => active && setKeyJson(''));
    return () => {
      active = false;
    };
  }, [source, secure]);

  const change = (field: keyof SpannerConnection, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setStatus('idle');
  };

  /** The raw key travels with the request; main stores only the key name. */
  const payload = (): SpannerConnection => ({
    ...form,
    username: form.project,
    password: '',
    keyfile: form.authMethod === 'service-account' ? keyJson : undefined,
    emulatorHost:
      form.authMethod === 'emulator' ? form.emulatorHost : undefined,
  });

  const problem = (): string | undefined => {
    if (!nameValidation.isValid)
      return nameValidation.message || 'Enter a valid connection name.';
    const ids = validateSpannerIds(form);
    if (ids) return ids;
    if (
      form.authMethod === 'emulator' &&
      !validateSpannerEmulatorHost(form.emulatorHost || '')
    )
      return 'Enter the emulator host as host:port.';
    if (form.authMethod === 'service-account')
      return validateSpannerKeyJson(keyJson);
    return undefined;
  };

  const handleTest = async () => {
    const error = problem();
    if (error) {
      toast.error(error);
      return;
    }
    setStatus('idle');
    try {
      // Test sends the key with the request; nothing reaches the keychain.
      await test(payload());
      setStatus('success');
      toast.success('Spanner connection test successful');
    } catch (err) {
      setStatus('failed');
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  // Saving is the only place the key is written to the keychain.
  const persistKey = async () => {
    if (form.authMethod === 'service-account') {
      await secure.setConnectionField(KEY_FIELD, keyJson, form.name);
    } else if (previous?.authMethod === 'service-account') {
      await secure.deleteConnectionField(KEY_FIELD, previous.name);
    }
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || testing) return;
    const error = problem();
    if (error) {
      toast.error(error);
      return;
    }
    setBusy(true);
    try {
      if (connection)
        await update({
          connection: { id: connection.id, connection: payload() },
        });
      else await configure({ connection: payload() });
      await persistKey();
      toast.success('Spanner connection saved');
      navigate('/app/connections');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const indicatorColor = {
    success: theme.palette.success.main,
    failed: theme.palette.error.main,
    idle: '#9e9e9e',
  }[status];

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
        title="Spanner Connection"
        imageSource={connectionIcons.images.spanner}
        onClose={onCancel}
        onSave={handleSave}
        isLoading={busy || testing}
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
        <TextField
          label="Connection Name"
          value={form.name}
          onChange={(event) => change('name', event.target.value)}
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
          label="Google Cloud Project ID"
          value={form.project}
          onChange={(event) => change('project', event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Spanner Instance ID"
          value={form.instance}
          onChange={(event) => change('instance', event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Database ID"
          value={form.database}
          onChange={(event) => change('database', event.target.value)}
          fullWidth
          required
        />
        <TextField
          select
          label="Authentication"
          value={form.authMethod}
          onChange={(event) =>
            change('authMethod', event.target.value as SpannerAuthMethod)
          }
          fullWidth
        >
          <MenuItem value="adc">Application Default Credentials</MenuItem>
          <MenuItem value="service-account">Service account JSON</MenuItem>
          <MenuItem value="emulator">Spanner emulator</MenuItem>
        </TextField>
        {form.authMethod === 'service-account' && (
          <TextField
            label="Service Account Key (JSON)"
            value={keyJson}
            onChange={(event) => {
              setKeyJson(event.target.value);
              setStatus('idle');
            }}
            fullWidth
            multiline
            rows={10}
            required
            variant="outlined"
            helperText="Paste the full contents of your Google Cloud service account key JSON file here."
            InputProps={{ style: { minHeight: '120px' } }}
            sx={{
              '& .MuiOutlinedInput-root': { height: 'auto' },
              '& .MuiInputBase-inputMultiline': {
                height: 'auto !important',
                resize: 'vertical',
              },
            }}
          />
        )}
        {form.authMethod === 'emulator' && (
          <TextField
            label="Emulator Host"
            value={form.emulatorHost}
            onChange={(event) => change('emulatorHost', event.target.value)}
            placeholder={DEFAULT_SPANNER_EMULATOR_HOST}
            fullWidth
            required
          />
        )}
        <TextField
          label="Schema (optional)"
          value={form.schema}
          onChange={(event) => change('schema', event.target.value)}
          helperText="Leave blank for the GoogleSQL default schema. Use public for a PostgreSQL-dialect database."
          fullWidth
        />
        <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-start' }}>
          <Button
            type="button"
            variant="contained"
            color="primary"
            onClick={handleTest}
            disabled={testing || busy}
            sx={{ position: 'relative', paddingRight: '32px', minWidth: 150 }}
            startIcon={
              testing ? <CircularProgress size={20} color="inherit" /> : null
            }
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
                backgroundColor: indicatorColor,
                border: `1px solid ${theme.palette.primary.contrastText}`,
              }}
            />
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
