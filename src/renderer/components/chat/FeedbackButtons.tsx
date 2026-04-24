import React from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { ThumbUp, ThumbDown } from '@mui/icons-material';

export const FeedbackButtons: React.FC<{ messageId: number }> = ({
  messageId,
}) => {
  const [feedback, setFeedback] = React.useState<'up' | 'down' | null>(() => {
    return localStorage.getItem(`feedback:${messageId}`) as
      | 'up'
      | 'down'
      | null;
  });

  const send = (value: 'up' | 'down') => {
    setFeedback(value);
    localStorage.setItem(`feedback:${messageId}`, value);
  };

  return (
    <>
      <Tooltip title="Helpful">
        <IconButton
          size="small"
          onClick={() => send('up')}
          sx={{ width: 20, height: 20 }}
        >
          <ThumbUp
            sx={{
              fontSize: 12,
              color: feedback === 'up' ? 'success.main' : 'text.disabled',
            }}
          />
        </IconButton>
      </Tooltip>
      <Tooltip title="Not helpful">
        <IconButton
          size="small"
          onClick={() => send('down')}
          sx={{ width: 20, height: 20 }}
        >
          <ThumbDown
            sx={{
              fontSize: 12,
              color: feedback === 'down' ? 'error.main' : 'text.disabled',
            }}
          />
        </IconButton>
      </Tooltip>
    </>
  );
};
