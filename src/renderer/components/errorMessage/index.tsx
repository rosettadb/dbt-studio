import React from 'react';
import { styled } from '@mui/material/styles';
import { Box, Typography } from '@mui/material';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';

const ErrorContainer = styled(Box)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  color: theme.palette.text.primary,
  border: `1px solid ${theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  padding: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  boxShadow: theme.shadows[2],
  margin: theme.spacing(2, 0),
}));

const IconWrapper = styled(Box)(() => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '2rem',
}));

type Props = {
  title?: string;
  description?: string;
};

export const ErrorMessage: React.FC<Props> = ({
  title = 'Something went wrong',
  description = 'Please try again or contact support.',
}) => {
  return (
    <ErrorContainer>
      <IconWrapper>
        <ErrorOutlineIcon fontSize="large" color="error" />
      </IconWrapper>
      <Box>
        <Typography variant="h6" fontWeight="bold">
          {title}
        </Typography>
        <Typography variant="body2">{description}</Typography>
      </Box>
    </ErrorContainer>
  );
};
