import { CircularProgress, Grid2, Typography } from '@mui/material';
import React from 'react';

type Props = {
  size?: number;
  message?: string;
  secondaryMessage?: string;
  marginTop?: number;
};

export const Loader: React.FC<Props> = ({
  message,
  secondaryMessage,
  marginTop,
  size,
}) => {
  return (
    <Grid2 container>
      <Grid2 size={4} />
      <Grid2
        size={4}
        style={{
          marginTop: marginTop !== undefined ? marginTop : 100,
          textAlign: 'center',
        }}
      >
        <CircularProgress size={size || 80} />
        {message && (
          <Typography
            style={{
              color: '#949494',
              marginTop: 5,
            }}
          >{`${message} ...`}</Typography>
        )}
        {secondaryMessage && (
          <Typography
            style={{
              color: '#949494',
              marginTop: 8,
              fontSize: '10pt',
            }}
          >
            {secondaryMessage}
          </Typography>
        )}
      </Grid2>
      <Grid2 size={4} />
    </Grid2>
  );
};
