import React from 'react';
import { Box, Typography, Collapse, CircularProgress } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import TerminalIcon from '@mui/icons-material/Terminal';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import SyncAltIcon from '@mui/icons-material/SyncAlt';
import ExtensionIcon from '@mui/icons-material/Extension';
import CloudIcon from '@mui/icons-material/Cloud';
import SettingsEthernetIcon from '@mui/icons-material/SettingsEthernet';
import SearchIcon from '@mui/icons-material/Search';
import HandymanIcon from '@mui/icons-material/Handyman';
import { useTheme } from '@mui/material/styles';

import { FileTypeBadge } from '../../utils/fileTypeIcon';
import type { ToolCallState } from '../../hooks/useAgentStream';
import { renderArguments, renderResult } from './ToolCallFormatters';

interface ToolCallRowProps {
  toolCall: ToolCallState;
  isExpanded?: boolean;
}

export const ToolCallRow: React.FC<ToolCallRowProps> = ({
  toolCall,
  isExpanded = false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = React.useState(isExpanded);
  const [showDetails, setShowDetails] = React.useState(false);

  // Extract label and icon logic
  const getToolDisplayInfo = () => {
    let icon: React.ReactNode = null;
    let label = '';
    let category: 'read' | 'write' | 'run' | 'other' = 'other';
    let suffix: React.ReactNode = null;

    const { toolName, args, result, status } = toolCall;

    switch (toolName) {
      case 'readDbtModel':
      case 'readFile': {
        const filePath = (args.filePath || args.path || '') as string;
        const filename = filePath.split('/').pop() || 'file';
        icon = <FileTypeBadge filename={filename} />;
        label = `Analyzed ${filename}`;
        category = 'read';
        break;
      }
      case 'listDirectory': {
        const dir = (args.directory || args.path || '') as string;
        icon = (
          <FolderOpenIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = `Listed ${dir}`;
        category = 'read';
        break;
      }
      case 'listDbtModels': {
        icon = (
          <FolderOpenIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = `Listed models`;
        category = 'read';
        break;
      }
      case 'getDbtLogs': {
        icon = (
          <DescriptionIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = `Read dbt logs`;
        category = 'read';
        break;
      }
      case 'studio_ducklake_schema_extract':
      case 'studio_sql_schema_extract': {
        icon = (
          <DescriptionIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done'
            ? `Analyzed database schema`
            : `Analyzing database schema`;
        category = 'read';
        break;
      }
      case 'studio_monaco_update': {
        icon = (
          <SyncAltIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done' ? `Updated SQL editor` : `Updating SQL editor`;
        category = 'write';
        break;
      }
      case 'studio_ducklake_query':
      case 'studio_sql_query': {
        icon = (
          <TerminalIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done' ? `Executed SQL query` : `Executing SQL query`;
        category = 'run';
        break;
      }
      case 'writeDbtModel':
      case 'writeFile': {
        const filePath = (args.filePath || args.path || '') as string;
        const filename = filePath.split('/').pop() || 'file';
        icon = <FileTypeBadge filename={filename} />;
        label = `Edited ${filename}`;
        category = 'write';
        // Check for diff stats in result
        if (status === 'done' && result && typeof result === 'object') {
          const r = result as any;
          if (r.linesAdded !== undefined && r.linesRemoved !== undefined) {
            suffix = (
              <Box
                sx={{
                  display: 'inline-flex',
                  gap: 0.5,
                  ml: 0.5,
                  fontSize: '0.75rem',
                }}
              >
                {r.linesAdded > 0 && (
                  <Box sx={{ color: theme.palette.success.main }}>
                    +{r.linesAdded}
                  </Box>
                )}
                {r.linesRemoved > 0 && (
                  <Box sx={{ color: theme.palette.error.main }}>
                    -{r.linesRemoved}
                  </Box>
                )}
              </Box>
            );
          }
        } else if (status === 'running') {
          suffix = (
            <Box
              sx={{
                display: 'inline-flex',
                gap: 0.5,
                ml: 0.5,
                fontSize: '0.75rem',
                opacity: 0.5,
              }}
            >
              <Box sx={{ color: theme.palette.success.main }}>+?</Box>
              <Box sx={{ color: theme.palette.error.main }}>-?</Box>
            </Box>
          );
        }
        break;
      }
      case 'studio_cli_run_dbt':
      case 'runDbtCommand': {
        const cmd = (args.command || args.cliCommand || '') as string;
        const select = args.select ? ` --select ${args.select}` : '';
        const fullCmd = `dbt ${cmd}${select}`;

        icon = (
          <TerminalIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done'
            ? `Ran ${fullCmd}`.substring(0, 50) +
              (fullCmd.length > 50 ? '...' : '')
            : `Running ${fullCmd}`.substring(0, 50) +
              (fullCmd.length > 50 ? '...' : '');
        category = 'run';
        break;
      }
      case 'loadSkill': {
        icon = (
          <ExtensionIcon
            sx={{ fontSize: '0.9rem', color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done'
            ? `Loaded skill: ${args.name}`
            : `Loading skill: ${args.name}`;
        category = 'read';
        break;
      }
      case 'pathExists': {
        icon = (
          <SearchIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = `Checked path`;
        category = 'read';
        break;
      }
      case 'studio_connections_list': {
        icon = (
          <SettingsEthernetIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done' ? `Listed connections` : `Listing connections`;
        category = 'read';
        break;
      }
      case 'studio_connections_test':
      case 'studio_cloud_connection_test': {
        icon = (
          <SettingsEthernetIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = status === 'done' ? `Tested connection` : `Testing connection`;
        category = 'run';
        break;
      }
      case 'studio_cloud_list_objects': {
        icon = (
          <CloudIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done' ? `Listed cloud objects` : `Listing cloud objects`;
        category = 'read';
        break;
      }
      case 'studio_cloud_preview_data': {
        icon = (
          <CloudIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          status === 'done' ? `Previewed cloud data` : `Previewing cloud data`;
        category = 'read';
        break;
      }
      default:
        icon = (
          <HandymanIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label = `Used ${toolName}`;
        category = 'other';
        break;
    }

    return { icon, label, category, suffix };
  };

  const { icon, label, suffix } = getToolDisplayInfo();
  const hasError = toolCall.status === 'error';
  const rawDetails = React.useMemo(
    () =>
      JSON.stringify(
        toolCall.result ?? {
          tool: toolCall.toolName,
          arguments: toolCall.args ?? {},
          error: toolCall.error ?? null,
          status: toolCall.status,
        },
        null,
        2,
      ),
    [toolCall],
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', my: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.8rem',
          cursor: 'pointer',
          background: hasError ? 'rgba(211, 47, 47, 0.05)' : 'transparent',
          borderRadius: 0.5,
          px: 0.5,
          py: 0.25,
          '&:hover': {
            background: hasError ? 'rgba(211, 47, 47, 0.1)' : 'action.hover',
          },
        }}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <KeyboardArrowDownIcon
            fontSize="small"
            sx={{ opacity: 0.5, ml: -0.5, mr: -0.5 }}
          />
        ) : (
          <KeyboardArrowRightIcon
            fontSize="small"
            sx={{ opacity: 0.5, ml: -0.5, mr: -0.5 }}
          />
        )}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
          }}
        >
          {hasError ? (
            <ErrorOutlineIcon
              fontSize="small"
              sx={{ color: theme.palette.error.main }}
            />
          ) : (
            icon
          )}
        </Box>
        <Typography
          variant="body2"
          sx={{
            flexGrow: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: hasError ? 'error.main' : 'text.primary',
            display: 'flex',
            alignItems: 'center',
            gap: 0.5,
          }}
        >
          {label}
          {suffix}
        </Typography>
        {toolCall.status === 'running' && (
          <CircularProgress
            size={12}
            color="inherit"
            sx={{ ml: 1, opacity: 0.7 }}
          />
        )}
        {toolCall.status === 'done' && !hasError && (
          <CheckCircleOutlineIcon
            sx={{
              width: 14,
              height: 14,
              ml: 1,
              color: theme.palette.success.main,
            }}
          />
        )}
      </Box>
      <Collapse in={expanded}>
        <Box
          sx={{
            p: 1.5,
            pl: 4,
            pt: 0.5,
            fontSize: '0.75rem',
            fontFamily: 'monospace',
            bgcolor: 'background.paper',
            borderRadius: 1,
            mt: 0.5,
            mb: 1,
            borderLeft: `2px solid ${theme.palette.divider}`,
            ml: 2.5,
            overflowX: 'auto',
          }}
        >
          {hasError && toolCall.error && (
            <Box sx={{ color: 'error.main', mb: 1 }}>{toolCall.error}</Box>
          )}

          <Box sx={{ color: 'text.secondary', mb: 0.5, fontWeight: 'bold' }}>
            Arguments:
          </Box>
          <Box
            sx={{
              color: 'text.primary',
              mb: toolCall.result ? 1.5 : 0,
            }}
          >
            {renderArguments(toolCall.toolName, toolCall.args)}
          </Box>

          {toolCall.result != null && (
            <>
              <Box
                sx={{ color: 'text.secondary', mb: 0.5, fontWeight: 'bold' }}
              >
                Result:
              </Box>
              <Box
                sx={{
                  color: 'text.primary',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 0.25,
                  cursor: 'pointer',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDetails((prev) => !prev);
                }}
              >
                {showDetails ? (
                  <KeyboardArrowUpIcon
                    sx={{
                      fontSize: 16,
                      color: 'text.secondary',
                      flexShrink: 0,
                      mt: 0.05,
                    }}
                  />
                ) : (
                  <KeyboardArrowRightIcon
                    sx={{
                      fontSize: 16,
                      color: 'text.secondary',
                      flexShrink: 0,
                      mt: 0.05,
                    }}
                  />
                )}
                <Box sx={{ minWidth: 0 }}>
                  {renderResult(toolCall.toolName, toolCall.result as any)}
                </Box>
              </Box>
            </>
          )}

          <Collapse in={showDetails}>
            <Box
              component="pre"
              sx={{
                mt: 0.75,
                mb: 0,
                p: 1,
                borderRadius: 1,
                bgcolor: 'background.default',
                color: 'text.primary',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                maxHeight: 260,
                overflow: 'auto',
                fontSize: '0.72rem',
              }}
            >
              {rawDetails}
            </Box>
          </Collapse>
        </Box>
      </Collapse>
    </Box>
  );
};
