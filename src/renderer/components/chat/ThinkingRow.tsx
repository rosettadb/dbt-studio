import React from 'react';
import { Box } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { ToggleSection } from './ToggleSection';
import { AnimatedEllipsis } from './AnimatedEllipsis';

interface ThinkingRowProps {
  content?: string;
  durationMs?: number;
  inProgress?: boolean;
}

export const ThinkingRow: React.FC<ThinkingRowProps> = ({
  content,
  durationMs,
  inProgress = false,
}) => {
  if (!content && !inProgress) {
    return null;
  }

  const durationSec = durationMs ? Math.round(durationMs / 1000) : null;
  const title = inProgress ? (
    <>
      Thinking
      <AnimatedEllipsis />
    </>
  ) : (
    `Thought for ${durationSec ?? '?'}s`
  );

  return (
    <Box
      sx={{
        my: 0.25,
        ml: 1,
        pl: 1,
        borderLeft: '2px solid',
        borderColor: 'divider',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <ToggleSection
        title={title}
        icon={
          <AutoAwesomeIcon sx={{ fontSize: 12, color: 'text.secondary' }} />
        }
      >
        <Box
          sx={{
            pt: 0.25,
            pb: 0.5,
            px: 0.5,
            color: 'text.secondary',
            opacity: 0.8,
            fontSize: '12px',
            lineHeight: 1.4,
            '& p': { m: 0, mb: 0.25, '&:last-child': { mb: 0 } },
            '& pre': {
              m: 0,
              p: 0.5,
              bgcolor: 'background.paper',
              borderRadius: 0.5,
              overflowX: 'auto',
              fontSize: '12px',
            },
            '& code': { fontFamily: 'monospace', fontSize: '12px' },
          }}
        >
          <Markdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
            {content || ''}
          </Markdown>
        </Box>
      </ToggleSection>
    </Box>
  );
};
