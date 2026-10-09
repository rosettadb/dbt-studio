import React from 'react';
import {
  Box,
  Switch,
  Select,
  MenuItem,
  FormControl,
  TextField,
  CircularProgress,
  Tooltip,
  IconButton,
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
import ChatBubbleOutline from '@mui/icons-material/ChatBubbleOutline';
import Tune from '@mui/icons-material/Tune';
import ScheduleOutlined from '@mui/icons-material/ScheduleOutlined';
import SettingsOutlined from '@mui/icons-material/SettingsOutlined';
import BuildOutlined from '@mui/icons-material/BuildOutlined';
import {
  useGetAISettings,
  useSaveAISettings,
  useGetAISettingsFilePath,
} from '../../controllers/aiSettings.controller';
import type { AISettingsConfig } from '../../../types/backend';
import { SettingsRow, SettingsSection, SettingsStack } from './SettingsLayout';

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
  // ── Notebooks ─────────────────────────────────────────────────────────────
  {
    id: 'notebooks_get_state',
    label: 'notebooks_get_state',
    description:
      'List the cells in the open notebook with their type, status and output',
    icon: <SearchIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_cell_read',
    label: 'notebooks_cell_read',
    description: 'Read the source of a Python, SQL or Markdown cell',
    icon: <ArticleIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_cell_add',
    label: 'notebooks_cell_add',
    description: 'Add a Python, SQL or Markdown cell to the notebook',
    icon: <CreateIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_cell_update',
    label: 'notebooks_cell_update',
    description: "Change a cell's source, type or SQL result variable",
    icon: <EditIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_cell_run',
    label: 'notebooks_cell_run',
    description:
      'Run a cell. Python, shell commands and SQL that changes data ask first',
    icon: <TerminalIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_cell_result',
    label: 'notebooks_cell_result',
    description: "Read a cell's status and outputs",
    icon: <StorageIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_variables',
    label: 'notebooks_variables',
    description: 'Inspect DataFrames and other variables in the Python kernel',
    icon: <PsychologyIcon sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_packages_list',
    label: 'notebooks_packages_list',
    description: "List the packages in a Python notebook's environment",
    icon: <BuildOutlined sx={{ fontSize: 16 }} />,
  },
  {
    id: 'notebooks_packages_install',
    label: 'notebooks_packages_install',
    description:
      "pip install packages into a Python notebook's environment (always asks first)",
    icon: <BuildOutlined sx={{ fontSize: 16 }} />,
  },
];

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

  const toolRow = (tool: ToolItem) => (
    <SettingsRow
      key={tool.id}
      label={
        <Box
          component="span"
          sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}
        >
          <Box
            component="span"
            sx={{ color: 'text.secondary', display: 'flex' }}
          >
            {tool.icon}
          </Box>
          {tool.label}
        </Box>
      }
      description={tool.description}
    >
      <Switch
        size="small"
        disabled={tool.planned}
        checked={!tool.planned && cfg.tools[tool.id] !== false}
        onChange={() => toggleTool(tool.id)}
      />
    </SettingsRow>
  );

  return (
    <SettingsStack>
      <SettingsSection title="Chat" icon={<ChatBubbleOutline />}>
        <SettingsRow
          label="Stream Responses"
          description="Display AI responses as they are generated in real time."
        >
          <Switch
            checked={cfg.chat.streamResponses}
            onChange={(e) => updateChat('streamResponses', e.target.checked)}
            size="small"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto-Include File Context"
          description="Automatically include the active file as context when sending messages."
        >
          <Switch
            checked={cfg.chat.autoIncludeFileContext}
            onChange={(e) =>
              updateChat('autoIncludeFileContext', e.target.checked)
            }
            size="small"
          />
        </SettingsRow>
        <SettingsRow
          label="Show Token Count"
          description="Display estimated token usage for each conversation."
        >
          <Switch
            checked={cfg.chat.showTokenCount}
            onChange={(e) => updateChat('showTokenCount', e.target.checked)}
            size="small"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto-Scroll to Latest"
          description="Automatically scroll to the latest message as responses stream in."
        >
          <Switch
            checked={cfg.chat.autoScrollToLatest}
            onChange={(e) => updateChat('autoScrollToLatest', e.target.checked)}
            size="small"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection
        title="Tools"
        icon={<Tune />}
        description="Tools available to the AI agent. Implemented tools are active now; planned tools are on the roadmap."
      >
        {TOOLS.filter((t) => !t.planned).map(toolRow)}
      </SettingsSection>

      <SettingsSection title="Planned tools" icon={<ScheduleOutlined />}>
        {TOOLS.filter((t) => t.planned).map(toolRow)}
      </SettingsSection>

      <SettingsSection title="Configuration" icon={<SettingsOutlined />}>
        <SettingsRow
          label="Allow AI in Background"
          description="Allow the AI agent to continue running when you switch conversations."
        >
          <Switch
            checked={cfg.configuration.allowAIInBackground}
            onChange={(e) =>
              updateConfig('allowAIInBackground', e.target.checked)
            }
            size="small"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto Execution"
          description="Control whether the AI can auto-execute terminal commands."
        >
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <Select
              value={cfg.configuration.autoExecution}
              onChange={(e) => updateConfig('autoExecution', e.target.value)}
              sx={{ fontSize: 13 }}
            >
              <MenuItem value="disabled">Disabled</MenuItem>
              <MenuItem value="allowlist">Allowlist</MenuItem>
              <MenuItem value="auto">Auto</MenuItem>
              <MenuItem value="turbo">Turbo</MenuItem>
            </Select>
          </FormControl>
        </SettingsRow>
        <SettingsRow
          label="Auto-Continue"
          description="Automatically continue the AI response when it reaches its per-response limit."
        >
          <Switch
            checked={cfg.configuration.autoContinue}
            onChange={(e) => updateConfig('autoContinue', e.target.checked)}
            size="small"
          />
        </SettingsRow>
        <SettingsRow
          label="Auto-Generate Memories"
          description="Autonomously generate memories to remember important context across sessions."
        >
          <Switch
            checked={cfg.configuration.autoGenerateMemories}
            onChange={(e) =>
              updateConfig('autoGenerateMemories', e.target.checked)
            }
            size="small"
          />
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="Advanced" icon={<BuildOutlined />}>
        <SettingsRow
          label="Max Workspace File Count"
          description="Maximum number of files the AI will index for workspace context. Set 0 for unlimited."
        >
          <TextField
            size="small"
            value={cfg.advanced.maxWorkspaceFileCount}
            onChange={(e) =>
              updateAdvanced('maxWorkspaceFileCount', Number(e.target.value))
            }
            sx={{ width: 100 }}
            inputProps={{ inputMode: 'numeric' }}
          />
        </SettingsRow>
        {filePath && (
          <SettingsRow label="Config file" description={filePath}>
            <Tooltip title="Open config file in editor">
              <IconButton
                size="small"
                onClick={() =>
                  window.electron.ipcRenderer.invoke(
                    'utils:open-path',
                    filePath,
                  )
                }
              >
                <OpenInNewIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </SettingsRow>
        )}
      </SettingsSection>
    </SettingsStack>
  );
};
