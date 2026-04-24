import React from 'react';
import { Box, Typography, Collapse, CircularProgress } from '@mui/material';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DescriptionIcon from '@mui/icons-material/Description';
import TerminalIcon from '@mui/icons-material/Terminal';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowRightIcon from '@mui/icons-material/KeyboardArrowRight';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import { useTheme } from '@mui/material/styles';

import { FileTypeBadge } from '../../utils/fileTypeIcon';
import type { ToolCallState } from '../../hooks/useAgentStream';

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
      case 'runDbtCommand': {
        const cmd = (args.command || args.cliCommand || '') as string;
        icon = (
          <TerminalIcon
            fontSize="small"
            sx={{ color: theme.palette.text.secondary }}
          />
        );
        label =
          `Running ${cmd}`.substring(0, 50) + (cmd.length > 50 ? '...' : '');
        category = 'run';
        break;
      }
      default:
        icon = (
          <Box
            sx={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              bgcolor: 'grey.500',
            }}
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

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', my: 0 }}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          fontSize: '0.8rem',
          cursor: hasError ? 'pointer' : 'default',
          background: hasError ? 'rgba(211, 47, 47, 0.05)' : 'transparent',
          borderRadius: 0.5,
          px: 0.5,
          py: 0.25,
          '&:hover': hasError ? { background: 'rgba(211, 47, 47, 0.1)' } : {},
        }}
        onClick={() => hasError && setExpanded(!expanded)}
      >
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 24,
          }}
        >
          {hasError && (
            <ErrorOutlineIcon
              fontSize="small"
              sx={{ color: theme.palette.error.main }}
            />
          )}
          {!hasError && icon}
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
        {hasError &&
          (expanded ? (
            <KeyboardArrowDownIcon fontSize="small" />
          ) : (
            <KeyboardArrowRightIcon fontSize="small" />
          ))}
      </Box>
      <Collapse in={expanded && hasError}>
        <Box
          sx={{
            p: 1,
            pl: 4,
            pt: 0,
            fontSize: '0.75rem',
            color: 'error.main',
            fontFamily: 'monospace',
          }}
        >
          {toolCall.error || 'Unknown error occurred'}
        </Box>
      </Collapse>
    </Box>
  );
};
