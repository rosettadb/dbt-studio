import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { toast } from 'react-toastify';
import { ConnectionModel, FabricSparkConnection } from '../../../types/backend';
import { FABRIC_API_ENDPOINT } from '../../../shared/connections/fabricConnection';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  useConfigureConnection,
  useGetConnections,
  useTestConnection,
  useUpdateConnection,
} from '../../controllers';
import { useConnectionNameValidation } from '../../utils/connectionValidation';
import ConnectionHeader from './connection-header';

type Props = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

const getFabric = (model?: ConnectionModel) =>
  model?.connection.type === 'fabricspark' ? model.connection : undefined;

export const FabricSpark: React.FC<Props> = ({
  onCancel,
  connection,
  projectId,
  duplicateFrom,
  suggestedName,
}) => {
  const navigate = useNavigate();
  const existing = getFabric(connection);
  const source = existing ?? getFabric(duplicateFrom);
  const [secret, setSecret] = React.useState('');
  const [nameTouched, setNameTouched] = React.useState(false);
  const [form, setForm] = React.useState<FabricSparkConnection>({
    type: 'fabricspark',
    name: existing?.name ?? suggestedName ?? '',
    endpoint: FABRIC_API_ENDPOINT,
    workspaceId: source?.workspaceId ?? '',
    lakehouseId: source?.lakehouseId ?? '',
    lakehouse: source?.lakehouse ?? '',
    schemaMode: source?.schemaMode ?? 'schema-enabled',
    schema: source?.schema ?? 'dbo',
    authentication: source?.authentication ?? 'CLI',
    clientId: source?.clientId,
    tenantId: source?.tenantId,
    hasClientSecret: existing?.hasClientSecret ?? false,
    threads: source?.threads ?? 1,
    environmentId: source?.environmentId,
    reuseSession: source?.reuseSession ?? true,
    highConcurrency: false,
    workspaceName: source?.workspaceName,
  });
  const { data: connections = [] } = useGetConnections();
  const nameValidation = useConnectionNameValidation(
    connections,
    connection?.id,
  ).validateName(form.name);
  const finish = () => navigate(projectId ? '/app' : '/app/connections');
  const configure = useConfigureConnection({
    onSuccess: () => {
      toast.success('Microsoft Fabric connection configured');
      finish();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const update = useUpdateConnection({
    onSuccess: () => {
      toast.success('Microsoft Fabric connection updated');
      finish();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const test = useTestConnection({
    onSuccess: (result) => {
      if (result === true) {
        toast.success('Microsoft Fabric connection test successful');
      } else {
        toast.error('Microsoft Fabric connection test failed');
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const setField = <K extends keyof FabricSparkConnection>(
    key: K,
    value: FabricSparkConnection[K],
  ) => {
    setForm((previous) => {
      const next = { ...previous, [key]: value };
      if (key === 'lakehouse' && next.schemaMode === 'non-schema') {
        next.schema = String(value);
      }
      if (key === 'schemaMode' && value === 'non-schema') {
        next.schema = next.lakehouse;
      }
      if (key === 'authentication' && value === 'CLI') {
        next.clientId = undefined;
        next.tenantId = undefined;
        next.hasClientSecret = false;
      }
      return next;
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nameValidation.isValid) {
      toast.error(nameValidation.message || 'Invalid connection name');
      return;
    }
    const fabricClientSecret = secret.trim() || undefined;
    if (connection) {
      update.mutate({
        connection: { id: connection.id, connection: form },
        writeOnlyCredentials: { clientSecret: fabricClientSecret },
      });
    } else {
      configure.mutate({
        projectId,
        connection: form,
        writeOnlyCredentials: { clientSecret: fabricClientSecret },
      });
    }
  };

  const textField = (
    label: string,
    key: 'workspaceId' | 'lakehouseId' | 'lakehouse' | 'schema',
    options?: { disabled?: boolean; helperText?: string },
  ) => (
    <TextField
      fullWidth
      required
      margin="normal"
      label={label}
      value={form[key]}
      disabled={options?.disabled}
      helperText={options?.helperText}
      onChange={(event) => setField(key, event.target.value)}
    />
  );

  const isSpn = form.authentication === 'SPN';
  return (
    <Box sx={{ width: '100%', p: 3 }}>
      <ConnectionHeader
        title="Microsoft Fabric Lakehouse"
        imageSource={connectionIcons.images.fabricspark}
        onClose={onCancel}
        onSave={submit}
        isLoading={configure.isLoading || update.isLoading}
      />
      <Box
        component="form"
        onSubmit={submit}
        sx={{ maxWidth: 620, mx: 'auto' }}
      >
        <Alert severity="info" sx={{ mb: 2 }}>
          Uses Microsoft Fabric Spark through Livy. Rosetta CLI/JDBC is not used
          for this connection.
        </Alert>
        <TextField
          fullWidth
          required
          margin="normal"
          label="Connection name"
          value={form.name}
          onChange={(event) => setField('name', event.target.value)}
          onBlur={() => setNameTouched(true)}
          error={nameTouched && !nameValidation.isValid}
          helperText={nameTouched ? nameValidation.message : ''}
        />
        {textField('Workspace ID', 'workspaceId')}
        {textField('Lakehouse ID', 'lakehouseId')}
        {textField('Lakehouse name', 'lakehouse')}
        <FormControl fullWidth margin="normal">
          <InputLabel id="fabric-schema-mode">Lakehouse schema mode</InputLabel>
          <Select
            labelId="fabric-schema-mode"
            label="Lakehouse schema mode"
            value={form.schemaMode}
            onChange={(event) =>
              setField(
                'schemaMode',
                event.target.value as FabricSparkConnection['schemaMode'],
              )
            }
          >
            <MenuItem value="schema-enabled">Schema enabled</MenuItem>
            <MenuItem value="non-schema">Non-schema Lakehouse</MenuItem>
          </Select>
        </FormControl>
        {textField('Schema', 'schema', {
          disabled: form.schemaMode === 'non-schema',
          helperText:
            form.schemaMode === 'non-schema'
              ? 'Uses the Lakehouse name for dbt-fabricspark.'
              : 'Use a schema such as dbo.',
        })}
        <FormControl fullWidth margin="normal">
          <InputLabel id="fabric-auth">Authentication</InputLabel>
          <Select
            labelId="fabric-auth"
            label="Authentication"
            value={form.authentication}
            onChange={(event) =>
              setField(
                'authentication',
                event.target.value as FabricSparkConnection['authentication'],
              )
            }
          >
            <MenuItem value="CLI">Azure CLI</MenuItem>
            <MenuItem value="SPN">Service principal</MenuItem>
          </Select>
        </FormControl>
        {isSpn ? (
          <>
            <TextField
              fullWidth
              required
              margin="normal"
              label="Tenant ID"
              value={form.tenantId ?? ''}
              onChange={(event) => setField('tenantId', event.target.value)}
            />
            <TextField
              fullWidth
              required
              margin="normal"
              label="Client ID"
              value={form.clientId ?? ''}
              onChange={(event) => setField('clientId', event.target.value)}
            />
            <TextField
              fullWidth
              required={!existing?.hasClientSecret}
              margin="normal"
              type="password"
              label={
                existing?.hasClientSecret
                  ? 'Replace client secret (optional)'
                  : 'Client secret'
              }
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              helperText="Stored only in the operating-system credential store."
            />
          </>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ my: 1 }}>
            Run az login before testing or using this connection.
          </Typography>
        )}
        <TextField
          fullWidth
          required
          margin="normal"
          type="number"
          label="dbt threads"
          value={form.threads}
          inputProps={{ min: 1, max: 32 }}
          onChange={(event) => setField('threads', Number(event.target.value))}
        />
        <TextField
          fullWidth
          margin="normal"
          label="Fabric Environment ID (optional)"
          value={form.environmentId ?? ''}
          onChange={(event) =>
            setField('environmentId', event.target.value || undefined)
          }
        />
        <TextField
          fullWidth
          margin="normal"
          label="Workspace name (optional)"
          value={form.workspaceName ?? ''}
          onChange={(event) =>
            setField('workspaceName', event.target.value || undefined)
          }
        />
        <FormControlLabel
          control={
            <Switch
              checked={form.reuseSession}
              onChange={(event) =>
                setField('reuseSession', event.target.checked)
              }
            />
          }
          label="Reuse Livy session"
        />
        <FormControlLabel
          control={<Switch checked={false} disabled />}
          label="High concurrency (not yet available)"
        />
        <Box sx={{ mt: 3 }}>
          <Button
            type="button"
            variant="outlined"
            disabled={test.isLoading}
            startIcon={
              test.isLoading ? <CircularProgress size={18} /> : undefined
            }
            onClick={() =>
              test.mutate({
                connection: form,
                writeOnlyCredentials: {
                  clientSecret: secret.trim() || undefined,
                },
              })
            }
          >
            {test.isLoading ? 'Testing…' : 'Test connection'}
          </Button>
        </Box>
      </Box>
    </Box>
  );
};
