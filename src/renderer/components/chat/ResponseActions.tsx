import React from 'react';
import { Box, Tooltip, IconButton, Typography } from '@mui/material';
import { ContentCopy, DeleteOutline, Check } from '@mui/icons-material';
import { FeedbackButtons } from './FeedbackButtons';

interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface ResponseActionsProps {
  content: string;
  role?: string;
  messageId: number;
  isStreaming: boolean;
  onDelete?: () => void;
  tokenUsage?: TokenUsage | null;
  showTokenCount?: boolean;
}

export const ResponseActions: React.FC<ResponseActionsProps> = ({
  content,
  role,
  messageId,
  isStreaming,
  onDelete,
  tokenUsage,
  showTokenCount,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isStreaming) return null;

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        mt: 0.25,
        minHeight: 20,
        opacity: 0.6,
        transition: 'opacity 0.2s',
        '&:hover': { opacity: 1 },
      }}
    >
      {/* Token usage — left side, on all assistant messages when available */}
      {role === 'assistant' && showTokenCount && tokenUsage ? (
        <Typography
          variant="caption"
          sx={{ fontSize: '11px', color: 'text.disabled' }}
        >
          {tokenUsage.totalTokens} tokens ({tokenUsage.promptTokens} in /{' '}
          {tokenUsage.completionTokens} out)
        </Typography>
      ) : (
        <Box />
      )}

      {/* Actions — right side */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
        <Tooltip title={copied ? 'Copied' : 'Copy'}>
          <IconButton
            size="small"
            onClick={handleCopy}
            sx={{ width: 20, height: 20 }}
          >
            {copied ? (
              <Check sx={{ fontSize: 12, color: 'success.main' }} />
            ) : (
              <ContentCopy sx={{ fontSize: 12 }} />
            )}
          </IconButton>
        </Tooltip>
        <FeedbackButtons messageId={messageId} />
        {onDelete && (
          <Tooltip title="Delete">
            <IconButton
              size="small"
              onClick={onDelete}
              sx={{ width: 20, height: 20 }}
            >
              <DeleteOutline sx={{ fontSize: 12 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
    </Box>
  );
};
