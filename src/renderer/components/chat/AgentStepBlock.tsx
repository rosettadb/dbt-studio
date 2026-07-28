import React from 'react';
import { Box, Typography } from '@mui/material';
import type { AgentStep, ToolCallState } from '../../hooks/useAgentStream';
import { ToolCallRow } from './ToolCallRow';
import { ToolCallGroup } from './ToolCallGroup';
import { ThinkingRow } from './ThinkingRow';

interface AgentStepBlockProps {
  step: AgentStep;
  isActive: boolean;
  thinkingText?: string; // Future: chat:reasoning:chunk
}

export const AgentStepBlock: React.FC<AgentStepBlockProps> = ({
  step,
  isActive,
  thinkingText,
}) => {
  const reads: ToolCallState[] = [];
  const writes: ToolCallState[] = [];
  const runs: ToolCallState[] = [];

  step.toolCalls.forEach((tc) => {
    switch (tc.toolName) {
      case 'readDbtModel':
      case 'readFile':
      case 'listDirectory':
      case 'listDbtModels':
      case 'getDbtLogs':
      case 'studio_pipeline_list':
      case 'studio_pipeline_read':
      case 'studio_pipeline_validate':
        reads.push(tc);
        break;
      case 'writeDbtModel':
      case 'writeFile':
      case 'studio_pipeline_write':
        writes.push(tc);
        break;
      case 'studio_cli_run_dbt':
      case 'runDbtCommand':
        runs.push(tc);
        break;
      default:
        // default to read if unknown
        reads.push(tc);
    }
  });

  const durationSec = step.durationMs
    ? (step.durationMs / 1000).toFixed(1)
    : null;

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        mb: 0.5,
        mt: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Thinking Row — only shown when there is actual thinking text */}
      {thinkingText && (
        <ThinkingRow content={thinkingText} inProgress={isActive} />
      )}

      {/* Reads */}
      <ToolCallGroup
        label={`Exploring ${reads.length} item${reads.length === 1 ? '' : 's'}`}
        defaultExpanded={isActive}
      >
        {reads.map((tc) => (
          <ToolCallRow key={tc.id} toolCall={tc} />
        ))}
      </ToolCallGroup>

      {/* Writes */}
      <ToolCallGroup
        label={`Editing ${writes.length} file${writes.length === 1 ? '' : 's'}`}
        defaultExpanded
      >
        {writes.map((tc) => (
          <ToolCallRow key={tc.id} toolCall={tc} />
        ))}
      </ToolCallGroup>

      {/* Runs */}
      <ToolCallGroup
        label={`Running ${runs.length} command${runs.length === 1 ? '' : 's'}`}
        defaultExpanded
      >
        {runs.map((tc) => (
          <ToolCallRow key={tc.id} toolCall={tc} />
        ))}
      </ToolCallGroup>

      {/* Summary Row */}
      {!isActive && durationSec && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.disabled',
            ml: 1,
            pl: 1,
            display: 'block',
            mt: 0.125,
            fontSize: '0.65rem',
          }}
        >
          Worked for {durationSec}s
        </Typography>
      )}
    </Box>
  );
};
