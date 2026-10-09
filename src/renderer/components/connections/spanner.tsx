import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  CircularProgress,
  MenuItem,
  TextField,
} from '@mui/material';
import { toast } from 'react-toastify';
import type {
  ConnectionModel,
  SpannerConnection,
} from '../../../types/backend';
import {
  DEFAULT_SPANNER_EMULATOR_HOST,
  validateServiceAccountKeyJson,
  validateSpannerIds,
  validateSpannerEmulatorHost,
} from '../../../shared/spanner';
import {
  useConfigureConnection,
  useGetConnections,
  useTestConnection,
  useUpdateConnection,
} from '../../controllers';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import connectionIcons from '../../../../assets/connectionIcons';
import ConnectionHeader from './connection-header';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

export const Spanner: React.FC<Props> = ({
  onCancel,
  connection,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const source = (connection?.connection || duplicateFrom?.connection) as
    | SpannerConnection
    | undefined;
  const [form, setForm] = React.useState<SpannerConnection>({
    type: 'spanner',
    name: source?.name || suggestedName || '',
    username: source?.project || '',
    password: '',
    project: source?.project || '',
    instance: source?.instance || '',
    database: source?.database || '',
    schema: source?.schema || '',
    authMethod: source?.authMethod || 'adc',
    keyfile: '',
    emulatorHost: source?.emulatorHost || DEFAULT_SPANNER_EMULATOR_HOST,
    dialect: source?.dialect,
  });
  const [keyJson, setKeyJson] = React.useState('');
  const [nameTouched, setNameTouched] = React.useState(false);
  const { data: existing = [] } = useGetConnections();
  const { validateName } = useConnectionNameValidation(
    existing,
    connection?.id,
  );
  const nameValidation = validateName(form.name);
  const {
    setSpannerServiceAccountKey,
    getSpannerServiceAccountKey,
    deleteSpannerServiceAccountKey,
  } = useSecureStorage();

  React.useEffect(() => {
    if (!source?.name || source.authMethod !== 'service-account') return;
    getSpannerServiceAccountKey(source.name)
      .then((key) => setKeyJson(key || ''))
      .catch(() => setKeyJson(''));
  }, [source, getSpannerServiceAccountKey]);

  const asStoredConnection = (): SpannerConnection => ({
    ...form,
    schema: form.schema || (form.dialect === 'POSTGRESQL' ? 'public' : ''),
    username: form.project,
    password: '',
    keyfile:
      form.authMethod === 'service-account' ? `db-spanner-${form.name}` : '',
  });
  const keyError = () =>
    form.authMethod === 'service-account'
      ? validateServiceAccountKeyJson(keyJson)
      : undefined;
  // After an update, drop the key saved under the old name if the connection
  // was renamed or no longer uses a service account.
  const removeReplacedKey = async () => {
    const previous = connection?.connection as SpannerConnection | undefined;
    if (previous?.authMethod !== 'service-account') return;
    if (form.authMethod === 'service-account' && previous.name === form.name)
      return;
    await deleteSpannerServiceAccountKey(previous.name).catch(() => undefined);
  };

  const { mutate: test, isLoading: testing } = useTestConnection({
    onSuccess: (result) => {
      if (result === true) toast.success('Spanner connection test successful.');
      else toast.error('Spanner connection test failed.');
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`);
    },
  });
  const { mutate: save, isLoading: saving } = useConfigureConnection({
    onSuccess: () => {
      toast.success('Spanner connection saved.');
      navigate('/app/connections');
    },
    onError: (error) => {
      toast.error(`Configuration failed: ${error}`);
    },
  });
  const { mutate: update, isLoading: updating } = useUpdateConnection({
    onSuccess: async () => {
      await removeReplacedKey();
      toast.success('Spanner connection updated.');
      navigate('/app/connections');
    },
    onError: (error) => {
      toast.error(`Update failed: ${error}`);
    },
  });

  const buildAndSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Enter a valid connection name.');
      return;
    }
    const error = validateSpannerIds(form);
    if (error) {
      toast.error(error);
      return;
    }
    if (
      form.authMethod === 'emulator' &&
      !validateSpannerEmulatorHost(form.emulatorHost || '')
    ) {
      toast.error('Enter emulator host as host:port.');
      return;
    }
    const invalidKey = keyError();
    if (invalidKey) {
      toast.error(invalidKey);
      return;
    }
    // Saving is the only place the key is written to the keychain.
    if (form.authMethod === 'service-account') {
      await setSpannerServiceAccountKey(keyJson, form.name);
    }
    const stored = asStoredConnection();
    if (connection)
      update({ connection: { id: connection.id, connection: stored } });
    else save({ connection: stored });
  };
  const handleTest = async () => {
    if (!form.name.trim()) {
      toast.error('Enter a connection name before testing.');
      return;
    }
    const error = validateSpannerIds(form);
    if (error) {
      toast.error(error);
      return;
    }
    const invalidKey = keyError();
    if (invalidKey) {
      toast.error(invalidKey);
      return;
    }
    const payload = {
      ...asStoredConnection(),
      keyfile: form.authMethod === 'service-account' ? keyJson : '',
    };
    // Test sends the key inline; nothing reaches the keychain until Save.
    test(payload);
  };
  const change =
    (field: keyof SpannerConnection) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));

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
        title="Google Cloud Spanner"
        imageSource={connectionIcons.images.spanner}
        onClose={onCancel}
        onSave={buildAndSave}
        isLoading={saving || updating}
      />
      <Box
        component="form"
        onSubmit={buildAndSave}
        sx={{
          width: '100%',
          maxWidth: 500,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <TextField
          label="Connection Name"
          required
          value={form.name}
          onChange={change('name')}
          onBlur={() => setNameTouched(true)}
          error={nameTouched && !nameValidation.isValid}
          helperText={
            nameTouched && !nameValidation.isValid ? nameValidation.message : ''
          }
        />
        <TextField
          label="Google Cloud Project ID"
          required
          value={form.project}
          onChange={change('project')}
        />
        <TextField
          label="Spanner Instance ID"
          required
          value={form.instance}
          onChange={change('instance')}
        />
        <TextField
          label="Database ID"
          required
          value={form.database}
          onChange={change('database')}
        />
        <TextField
          select
          label="Authentication"
          value={form.authMethod}
          onChange={change('authMethod')}
        >
          <MenuItem value="adc">Application Default Credentials</MenuItem>
          <MenuItem value="service-account">Service account JSON</MenuItem>
          <MenuItem value="emulator">Spanner emulator</MenuItem>
        </TextField>
        {form.authMethod === 'service-account' && (
          <TextField
            label="Service account JSON"
            value={keyJson}
            onChange={(event) => setKeyJson(event.target.value)}
            fullWidth
            multiline
            rows={10}
            required
            variant="outlined"
            helperText="Paste the full contents of your Google Cloud service account key JSON file here."
            InputProps={{
              style: { minHeight: '120px' },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                height: 'auto',
              },
              '& .MuiInputBase-inputMultiline': {
                height: 'auto !important',
                resize: 'vertical',
              },
            }}
          />
        )}
        {form.authMethod === 'emulator' && (
          <TextField
            label="Emulator host"
            required
            value={form.emulatorHost}
            onChange={change('emulatorHost')}
            placeholder={DEFAULT_SPANNER_EMULATOR_HOST}
          />
        )}
        <TextField
          label="Schema (optional)"
          value={form.schema}
          onChange={change('schema')}
          helperText="Leave blank for GoogleSQL's default schema."
        />
        {form.dialect && (
          <Box sx={{ color: 'text.secondary' }}>
            Detected dialect:{' '}
            {form.dialect === 'POSTGRESQL' ? 'PostgreSQL' : 'GoogleSQL'}
          </Box>
        )}
        <Button
          type="button"
          variant="contained"
          color="primary"
          onClick={handleTest}
          disabled={testing || saving || updating}
        >
          {testing ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            'Test Connection'
          )}
        </Button>
      </Box>
    </Box>
  );
};
