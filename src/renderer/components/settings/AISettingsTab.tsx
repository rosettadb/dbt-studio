import React from 'react';
import {
  Box,
  Typography,
  Switch,
  Divider,
  Select,
  MenuItem,
  FormControl,
  TextField,
  Checkbox,
  CircularProgress,
  Tooltip,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import EditIcon from '@mui/icons-material/Edit';
import ArticleIcon from '@mui/icons-material/Article';
import SearchIcon from '@mui/icons-material/Search';
import TerminalIcon from '@mui/icons-material/Terminal';
import LanguageIcon from '@mui/icons-material/Language';
import PsychologyIcon from '@mui/icons-material/Psychology';
import PatchIcon from '@mui/icons-material/MergeType';
import CreateIcon from '@mui/icons-material/NoteAdd';
import StorageIcon from '@mui/icons-material/Storage';
import TuneIcon from '@mui/icons-material/Tune';
import {
  useGetAISettings,
  useSaveAISettings,
  useGetAISettingsFilePath,
} from '../../controllers/aiSettings.controller';
import type { AISettingsConfig } from '../../../types/backend';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ToolItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  planned?: boolean;
}

// ─── Tools ────────────────────────────────────────────────────────────────────
// Available = implemented in dbt.tools.ts + filesystem.tools.ts (Phases 4-5 ✅)
// Planned   = roadmap from Plan 28 (MCP, Skills, database, cloud)

const TOOLS: ToolItem[] = [
  // ── dbt tools (src/main/services/ai/tools/dbt.tools.ts) ───────────────────
  {
    id: 'readDbtModel',
    label: 'readDbtModel',
    description:
      'Read a dbt model, macro, schema.yml, or config file from the project',
    icon: <ArticleIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'writeDbtModel',
    label: 'writeDbtModel',
    description:
      'Write or update a dbt model SQL or YAML file (confirms before overwriting)',
    icon: <EditIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'runDbtCommand',
    label: 'runDbtCommand',
    description:
      'Execute dbt CLI commands: run, test, compile, docs, debug, deps, source',
    icon: <TerminalIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'listDbtModels',
    label: 'listDbtModels',
    description:
      'List all dbt model .sql files in the project, with optional name filter',
    icon: <SearchIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'getDbtLogs',
    label: 'getDbtLogs',
    description:
      'Read recent dbt run logs to diagnose errors and understand command output',
    icon: <ArticleIcon sx={{ fontSize: 16 }} />,
  },

  // ── Filesystem tools (src/main/services/ai/tools/filesystem.tools.ts) ──────
  {
    id: 'listDirectory',
    label: 'listDirectory',
    description:
      'List files and directories in the project (recursive optional)',
    icon: <FolderOpenIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'readFile',
    label: 'readFile',
    description: 'Read the contents of any text file within the project',
    icon: <ArticleIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'writeFile',
    label: 'writeFile',
    description: 'Write content to any text file — creates or overwrites',
    icon: <CreateIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'pathExists',
    label: 'pathExists',
    description: 'Check if a file or directory exists at a given path',
    icon: <SearchIcon sx={{ fontSize: 16 }} />,
  },

  // ── Planned — MCP Servers (Plan 28a, Wk 5-6) ──────────────────────────────
  {
    id: 'mcp_rosetta',
    label: 'mcp_rosetta',
    description:
      'Rosetta CLI MCP server — schema translation and connector operations',
    icon: <StorageIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },
  {
    id: 'mcp_dbt',
    label: 'mcp_dbt',
    description:
      'dbt MCP server — project metadata, lineage, and manifest queries',
    icon: <StorageIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },
  {
    id: 'mcp_duckdb',
    label: 'mcp_duckdb',
    description:
      'DuckDB MCP server — SQL queries against DuckLake and local databases',
    icon: <StorageIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },

  // ── Planned — Skills (Plan 28b, Wk 6-7) ───────────────────────────────────
  {
    id: 'loadSkill',
    label: 'loadSkill',
    description:
      'Load a SKILL.md file and inject specialised instructions into the agent',
    icon: <PsychologyIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },

  // ── Planned — Data & Cloud ─────────────────────────────────────────────────
  {
    id: 'sql_query',
    label: 'sql_query',
    description: 'Execute a read-only SQL query against a connected database',
    icon: <StorageIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },
  {
    id: 'cloud_storage',
    label: 'cloud_storage',
    description: 'List and read files from S3, Azure Blob, or GCS buckets',
    icon: <LanguageIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },
  {
    id: 'git_ops',
    label: 'git_ops',
    description: 'Stage, commit, diff, and push changes via git',
    icon: <PatchIcon sx={{ fontSize: 16 }} />,
    planned: true,
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SettingRowProps {
  label: string;
  description: string;
  control: React.ReactNode;
}

const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  control,
}) => (
  <Box
    sx={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      py: 1.5,
    }}
  >
    <Box sx={{ flex: 1, pr: 4 }}>
      <Typography variant="body2" fontWeight={500}>
        {label}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
    </Box>
    <Box sx={{ flexShrink: 0 }}>{control}</Box>
  </Box>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <Typography variant="subtitle1" fontWeight={600} sx={{ mt: 3, mb: 1 }}>
    {children}
  </Typography>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const AISettingsTab: React.FC = () => {
  const { data: saved, isLoading } = useGetAISettings();
  const { mutate: save } = useSaveAISettings();
  const { data: filePath } = useGetAISettingsFilePath();

  // Derive local state from saved config (falls back to defaults while loading)
  const cfg = saved;

  const update = React.useCallback(
    (patch: Partial<Parameters<typeof save>[0]>) => {
      if (!cfg) return;
      save({ ...cfg, ...patch });
    },
    [cfg, save],
  );

  const updateChat = (key: keyof AISettingsConfig['chat'], value: boolean) => {
    if (!cfg) return;
    update({ chat: { ...cfg.chat, [key]: value } });
  };

  const updateConfig = (
    key: keyof AISettingsConfig['configuration'],
    value: boolean | string,
  ) => {
    if (!cfg) return;
    update({ configuration: { ...cfg.configuration, [key]: value } });
  };

  const updateAdvanced = (
    key: keyof AISettingsConfig['advanced'],
    value: number,
  ) => {
    if (!cfg) return;
    update({ advanced: { ...cfg.advanced, [key]: value } });
  };

  const toggleTool = (id: string) => {
    if (!cfg) return;
    update({ tools: { ...cfg.tools, [id]: !cfg.tools[id] } });
  };

  if (isLoading || !cfg) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 720 }}>
      <SectionTitle>Chat</SectionTitle>
      <Divider />
      <SettingRow
        label="Stream Responses"
        description="Display AI responses as they are generated in real time."
        control={
          <Switch
            checked={cfg.chat.streamResponses}
            onChange={(e) => updateChat('streamResponses', e.target.checked)}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: '#4caf50',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#4caf50',
              },
            }}
          />
        }
      />
      <Divider />
      <SettingRow
        label="Auto-Include File Context"
        description="Automatically include the active file as context when sending messages."
        control={
          <Switch
            checked={cfg.chat.autoIncludeFileContext}
            onChange={(e) =>
              updateChat('autoIncludeFileContext', e.target.checked)
            }
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: '#4caf50',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#4caf50',
              },
            }}
          />
        }
      />
      <Divider />
      <SettingRow
        label="Show Token Count"
        description="Display estimated token usage for each conversation."
        control={
          <Switch
            checked={cfg.chat.showTokenCount}
            onChange={(e) => updateChat('showTokenCount', e.target.checked)}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: '#4caf50',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#4caf50',
              },
            }}
          />
        }
      />
      <Divider />
      <SettingRow
        label="Auto-Scroll to Latest"
        description="Automatically scroll to the latest message as responses stream in."
        control={
          <Switch
            checked={cfg.chat.autoScrollToLatest}
            onChange={(e) => updateChat('autoScrollToLatest', e.target.checked)}
            size="small"
            sx={{
              '& .MuiSwitch-switchBase.Mui-checked': {
                color: '#4caf50',
              },
              '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': {
                backgroundColor: '#4caf50',
              },
            }}
          />
        }
      />

      <SectionTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <TuneIcon sx={{ fontSize: 18 }} />
          Tools
        </Box>
      </SectionTitle>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ mb: 1, display: 'block' }}
      >
        Tools available to the AI agent. Implemented tools are active now;
        planned tools are on the roadmap.
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
      {TOOLS.filter((t) => !t.planned).map((tool) => (
        <Box
          key={tool.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: 0.5,
            px: 0.5,
            borderRadius: 1,
            '&:hover': { bgcolor: 'action.hover' },
          }}
        >
          <Checkbox
            size="small"
            checked={cfg.tools[tool.id] !== false}
            onChange={() => toggleTool(tool.id)}
            sx={{ p: 0.25, mr: 0.5 }}
          />
          <Box sx={{ color: 'text.secondary', display: 'flex', mr: 0.75 }}>
            {tool.icon}
          </Box>
          <Typography
            variant="body2"
            fontWeight={600}
            component="span"
            sx={{ mr: 1, minWidth: 100 }}
          >
            {tool.label}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {tool.description}
          </Typography>
        </Box>
      ))}

      <Typography
        variant="caption"
        color="text.disabled"
        sx={{ mt: 1.5, mb: 0.5, display: 'block', fontStyle: 'italic' }}
      >
        Planned tools
      </Typography>
      <Divider sx={{ mb: 0.5 }} />
      {TOOLS.filter((t) => t.planned).map((tool) => (
        <Box
          key={tool.id}
          sx={{
            display: 'flex',
            alignItems: 'center',
            py: 0.5,
            px: 0.5,
            borderRadius: 1,
            opacity: 0.45,
          }}
        >
          <Checkbox size="small" disabled sx={{ p: 0.25, mr: 0.5 }} />
          <Box sx={{ color: 'text.disabled', display: 'flex', mr: 0.75 }}>
            {tool.icon}
          </Box>
          <Typography
            variant="body2"
            fontWeight={600}
            component="span"
            sx={{ mr: 1, minWidth: 100, color: 'text.disabled' }}
          >
            {tool.label}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {tool.description}
          </Typography>
        </Box>
      ))}

      <SectionTitle>Configuration</SectionTitle>
      <Divider />
      <SettingRow
        label="Allow AI in Background"
        description="Allow the AI agent to continue running when you switch conversations."
        control={
          <Switch
            checked={cfg.configuration.allowAIInBackground}
            onChange={(e) =>
              updateConfig('allowAIInBackground', e.target.checked)
            }
            size="small"
          />
        }
      />
      <Divider />
      <SettingRow
        label="Auto Execution"
        description="Control whether the AI can auto-execute terminal commands."
        control={
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={cfg.configuration.autoExecution}
              onChange={(e) => updateConfig('autoExecution', e.target.value)}
            >
              <MenuItem value="disabled">Disabled</MenuItem>
              <MenuItem value="allowlist">Allowlist</MenuItem>
              <MenuItem value="auto">Auto</MenuItem>
              <MenuItem value="turbo">Turbo</MenuItem>
            </Select>
          </FormControl>
        }
      />
      <Divider />
      <SettingRow
        label="Auto-Continue"
        description="Automatically continue the AI response when it reaches its per-response limit."
        control={
          <Switch
            checked={cfg.configuration.autoContinue}
            onChange={(e) => updateConfig('autoContinue', e.target.checked)}
            size="small"
          />
        }
      />
      <Divider />
      <SettingRow
        label="Auto-Generate Memories"
        description="Autonomously generate memories to remember important context across sessions."
        control={
          <Switch
            checked={cfg.configuration.autoGenerateMemories}
            onChange={(e) =>
              updateConfig('autoGenerateMemories', e.target.checked)
            }
            size="small"
          />
        }
      />

      <SectionTitle>Advanced</SectionTitle>
      <Divider />
      <SettingRow
        label="Max Workspace File Count"
        description="Maximum number of files the AI will index for workspace context. Set 0 for unlimited."
        control={
          <TextField
            size="small"
            value={cfg.advanced.maxWorkspaceFileCount}
            onChange={(e) =>
              updateAdvanced('maxWorkspaceFileCount', Number(e.target.value))
            }
            sx={{ width: 100 }}
            inputProps={{ inputMode: 'numeric' }}
          />
        }
      />

      {/* Config file path */}
      {filePath && (
        <Box
          sx={{
            mt: 3,
            pt: 1.5,
            borderTop: '1px solid',
            borderColor: 'divider',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {filePath}
          </Typography>
          <Tooltip title="Open config file in editor">
            <OpenInNewIcon
              sx={{
                fontSize: 14,
                color: 'text.disabled',
                cursor: 'pointer',
                flexShrink: 0,
              }}
              onClick={() =>
                window.electron.ipcRenderer.invoke('utils:open-path', filePath)
              }
            />
          </Tooltip>
        </Box>
      )}
    </Box>
  );
};
