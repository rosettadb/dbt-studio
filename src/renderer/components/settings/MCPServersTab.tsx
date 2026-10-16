import React, { useState } from 'react';
import {
  Box,
  Typography,
  Switch,
  IconButton,
  Chip,
  CircularProgress,
  Alert,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import HubOutlined from '@mui/icons-material/HubOutlined';
import {
  useMCPServers,
  useMCPServerTools,
} from '../../controllers/mcp.controller';
import type {
  MCPServerFileEntry,
  MCPServerWithStatus,
} from '../../../types/backend';
import {
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
} from './SettingsLayout';

const ServerAvatar: React.FC<{ name: string }> = ({ name }) => {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  return (
    <Box
      sx={{
        width: 24,
        height: 24,
        borderRadius: 1,
        bgcolor: 'primary.main',
        color: 'primary.contrastText',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.6rem',
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {initials}
    </Box>
  );
};

const ToolsList: React.FC<{ serverId: string; connected: boolean }> = ({
  serverId,
  connected,
}) => {
  const { data: tools, isLoading } = useMCPServerTools(serverId, connected);
  if (!connected) return null;
  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 1 }}>
        <CircularProgress size={14} />
        <Typography variant="caption" color="text.secondary">
          Loading tools…
        </Typography>
      </Box>
    );
  }
  if (!tools?.length) {
    return (
      <Typography variant="caption" color="text.secondary">
        No tools available.
      </Typography>
    );
  }
  return (
    <Box>
      <FormControlLabel
        control={<Checkbox size="small" checked />}
        label={
          <Typography variant="caption" fontWeight={600}>
            All Tools ({tools.length})
          </Typography>
        }
        sx={{ mb: 0.5 }}
      />
      {tools.map((tool) => (
        <Box key={tool.name} sx={{ pl: 3, mb: 1 }}>
          <FormControlLabel
            control={<Checkbox size="small" defaultChecked />}
            label={
              <Box>
                <Typography variant="caption" fontWeight={600} display="block">
                  {tool.name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {tool.description}
                </Typography>
              </Box>
            }
          />
        </Box>
      ))}
    </Box>
  );
};

// Single-value list editor (used for args)
const ListEditor: React.FC<{
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder = 'value' }) => {
  const add = () => onChange([...value, '']);
  const update = (i: number, v: string) => {
    const next = [...value];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(value.filter((_, idx) => idx !== i));
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Button
          size="small"
          onClick={add}
          sx={{ minWidth: 0, fontSize: '0.7rem' }}
        >
          + Add
        </Button>
      </Box>
      {value.map((v, i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
          <TextField
            size="small"
            placeholder={placeholder}
            value={v}
            onChange={(e) => update(i, e.target.value)}
            fullWidth
          />
          <IconButton size="small" onClick={() => remove(i)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
};

// Key-value pair editor (used for headers and env)
const KVEditor: React.FC<{
  label: string;
  value: Record<string, string>;
  onChange: (v: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  valueType?: 'text' | 'password';
}> = ({
  label,
  value,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  valueType = 'text',
}) => {
  const pairs = Object.entries(value);
  const add = () => onChange({ ...value, '': '' });
  const update = (oldKey: string, newKey: string, newVal: string) => {
    const next: Record<string, string> = {};
    Object.entries(value).forEach(([k, v]) => {
      if (k === oldKey) next[newKey] = newVal;
      else next[k] = v;
    });
    onChange(next);
  };
  const remove = (k: string) => {
    const next = { ...value };
    delete next[k];
    onChange(next);
  };
  return (
    <Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          mb: 0.5,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Button
          size="small"
          onClick={add}
          sx={{ minWidth: 0, fontSize: '0.7rem' }}
        >
          + Add
        </Button>
      </Box>
      {pairs.map(([k, v], i) => (
        <Box key={i} sx={{ display: 'flex', gap: 1, mb: 0.5 }}>
          <TextField
            size="small"
            placeholder={keyPlaceholder}
            value={k}
            onChange={(e) => update(k, e.target.value, v)}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            placeholder={valuePlaceholder}
            value={v}
            type={valueType}
            onChange={(e) => update(k, k, e.target.value)}
            sx={{ flex: 2 }}
          />
          <IconButton size="small" onClick={() => remove(k)}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        </Box>
      ))}
    </Box>
  );
};

const AddServerDialog: React.FC<{
  open: boolean;
  onClose: () => void;
  onAdd: (id: string, entry: MCPServerFileEntry) => void;
}> = ({ open, onClose, onAdd }) => {
  const [id, setId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'http'>('http');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('docker');
  const [args, setArgs] = useState<string[]>([]);
  const [headers, setHeaders] = useState<Record<string, string>>({});
  const [env, setEnv] = useState<Record<string, string>>({});

  const reset = () => {
    setId('');
    setName('');
    setDescription('');
    setUrl('');
    setCommand('docker');
    setArgs([]);
    setHeaders({});
    setEnv({});
  };

  const handleAdd = () => {
    const entry: MCPServerFileEntry = {
      name,
      description,
      disabled: false,
      transport,
      ...(transport === 'stdio'
        ? {
            command,
            args: args.filter(Boolean),
            ...(Object.keys(env).length ? { env } : {}),
          }
        : {
            url,
            ...(Object.keys(headers).length ? { headers } : {}),
          }),
    };
    onAdd(id.trim().toLowerCase().replace(/\s+/g, '-'), entry);
    onClose();
    reset();
  };

  const valid =
    id.trim() &&
    name.trim() &&
    (transport === 'stdio' ? command.trim() : url.trim());

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Add MCP Server</DialogTitle>
      <DialogContent
        sx={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          pt: '16px !important',
        }}
      >
        <TextField
          label="Server ID"
          value={id}
          onChange={(e) => setId(e.target.value)}
          size="small"
          placeholder="github"
          helperText="Unique identifier (no spaces)"
        />
        <TextField
          label="Display Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          size="small"
          placeholder="GitHub"
        />
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          size="small"
        />
        <FormControl size="small">
          <InputLabel>Transport</InputLabel>
          <Select
            value={transport}
            label="Transport"
            onChange={(e) =>
              setTransport(e.target.value as 'stdio' | 'sse' | 'http')
            }
          >
            <MenuItem value="http">HTTP / Streamable (remote)</MenuItem>
            <MenuItem value="sse">SSE (remote)</MenuItem>
            <MenuItem value="stdio">stdio (local CLI / Docker)</MenuItem>
          </Select>
        </FormControl>

        {transport === 'stdio' ? (
          <>
            <TextField
              label="Command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              size="small"
              placeholder="docker"
            />
            <ListEditor
              label="Arguments"
              value={args}
              onChange={setArgs}
              placeholder="run -i --rm --mount type=bind,src=/path,dst=/projects/path mcp/filesystem /projects"
            />
            <KVEditor
              label="Environment Variables"
              value={env}
              onChange={setEnv}
              keyPlaceholder="GITHUB_PERSONAL_ACCESS_TOKEN"
              valuePlaceholder="ghp_..."
              valueType="password"
            />
          </>
        ) : (
          <>
            <TextField
              label="Server URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              size="small"
              placeholder="https://api.githubcopilot.com/mcp/"
            />
            <KVEditor
              label="Headers (optional)"
              value={headers}
              onChange={setHeaders}
              keyPlaceholder="Authorization"
              valuePlaceholder="Bearer ghp_..."
              valueType="password"
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleAdd} disabled={!valid}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
};

const ServerRow: React.FC<{
  server: MCPServerWithStatus;
  onConnect: (id: string) => void;
  onDisconnect: (id: string) => void;
  onToggle: (id: string, disabled: boolean) => void;
  onRemove: (id: string) => void;
  isConnecting: boolean;
  connectingId: string | null;
}> = ({
  server,
  onConnect,
  onDisconnect,
  onToggle,
  onRemove,
  isConnecting,
  connectingId,
}) => {
  const enabled = !server.disabled;
  const isThisConnecting = isConnecting && connectingId === server.id;
  const [expanded, setExpanded] = useState(false);

  return (
    <Box>
      <SettingsRow
        label={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ServerAvatar name={server.name} />
            {server.name}
            <Chip label="Custom" size="small" variant="outlined" />
          </Box>
        }
        description={server.description ?? 'Custom MCP server'}
      >
        <Typography
          variant="caption"
          color={enabled ? 'success.main' : 'text.disabled'}
        >
          {enabled ? 'Enabled' : 'Disabled'}
        </Typography>
        <Switch
          size="small"
          checked={enabled}
          onChange={(e) => onToggle(server.id, !e.target.checked)}
        />
        {isThisConnecting && <CircularProgress size={16} />}
        {!isThisConnecting && server.connected && (
          <Button
            size="small"
            variant="outlined"
            color="error"
            onClick={() => onDisconnect(server.id)}
          >
            Disconnect
          </Button>
        )}
        {!isThisConnecting && !server.connected && (
          <Tooltip title={!enabled ? 'Enable server first' : ''}>
            <span>
              <Button
                size="small"
                variant="outlined"
                disabled={!enabled || isConnecting}
                onClick={() => onConnect(server.id)}
              >
                Connect
              </Button>
            </span>
          </Tooltip>
        )}
        {server.connected && (
          <Tooltip title={expanded ? 'Hide tools' : 'Show tools'}>
            <IconButton
              size="small"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              <ExpandMoreIcon
                fontSize="small"
                sx={{
                  transform: expanded ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              />
            </IconButton>
          </Tooltip>
        )}
        {!server.isBuiltIn && (
          <Tooltip title="Remove server">
            <IconButton
              size="small"
              onClick={() => onRemove(server.id)}
              sx={{
                color: 'text.disabled',
                '&:hover': { color: 'error.main' },
              }}
            >
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </SettingsRow>
      {server.connected && expanded && (
        <SettingsSectionBody>
          <ToolsList serverId={server.id} connected={server.connected} />
        </SettingsSectionBody>
      )}
    </Box>
  );
};

export const MCPServersTab: React.FC = () => {
  const {
    servers,
    isLoading,
    connect,
    disconnect,
    toggle,
    addServer,
    removeServer,
    isConnecting,
    connectingId,
    error,
  } = useMCPServers();
  const [addOpen, setAddOpen] = useState(false);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <SettingsStack>
      {!!error && (
        <Alert severity="error">
          {error instanceof Error ? error.message : 'Operation failed'}
        </Alert>
      )}

      <SettingsSection
        title="MCP Servers"
        icon={<HubOutlined />}
        description="Give the AI agent access to more data tools. Servers run locally alongside dbt Studio."
        action={
          <Button
            size="small"
            startIcon={<AddIcon />}
            variant="outlined"
            onClick={() => setAddOpen(true)}
          >
            Add Server
          </Button>
        }
      >
        {servers.length === 0 ? (
          <SettingsRow label="No MCP servers configured." />
        ) : (
          servers.map((server) => (
            <ServerRow
              key={server.id}
              server={server}
              onConnect={(id) => connect(id)}
              onDisconnect={(id) => disconnect(id)}
              onToggle={(id, disabled) => toggle({ serverId: id, disabled })}
              onRemove={(id) => removeServer(id)}
              isConnecting={isConnecting}
              connectingId={connectingId}
            />
          ))
        )}
        <SettingsSectionBody>
          <Typography variant="caption" color="text.secondary">
            <strong>Security:</strong> MCP servers are local CLI tools executed
            by the app. When connected, the AI agent can call these tools on
            your behalf. Always review destructive operations in the chat log.
          </Typography>
        </SettingsSectionBody>
      </SettingsSection>

      <AddServerDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(id, entry) => addServer({ id, entry })}
      />
    </SettingsStack>
  );
};
