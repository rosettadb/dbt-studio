import React from 'react';
import { Box, Typography, Button, Paper, Alert } from '@mui/material';
import DatabaseIcon from '@mui/icons-material/Storage';
import { useNavigate } from 'react-router-dom';

interface NoConnectionMessageProps {
  projectName: string;
}

export const NoConnectionMessage: React.FC<NoConnectionMessageProps> = ({
  projectName,
}) => {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 3,
      }}
    >
      <Paper
        elevation={2}
        sx={{
          padding: 4,
          maxWidth: 500,
          textAlign: 'center',
          borderRadius: 2,
        }}
      >
        <Box sx={{ mb: 3 }}>
          <DatabaseIcon
            sx={{
              fontSize: 64,
              color: 'text.secondary',
              mb: 2,
            }}
          />
        </Box>

        <Typography variant="h5" component="h2" gutterBottom>
          No Database Connection
        </Typography>

        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          The project <strong>{projectName}</strong> doesn&apos;t have a
          database connection configured. You need to set up a connection before
          you can run SQL queries.
        </Typography>

        <Alert severity="info" sx={{ mb: 3, textAlign: 'left' }}>
          <Typography variant="body2">You can add a connection by:</Typography>
          <Box component="ul" sx={{ mt: 1, mb: 0, pl: 2 }}>
            <Typography component="li" variant="body2">
              Going to the project settings
            </Typography>
            <Typography component="li" variant="body2">
              Using the connection management screen
            </Typography>
            <Typography component="li" variant="body2">
              Or importing a project with existing connection files
            </Typography>
          </Box>
        </Alert>

        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<DatabaseIcon />}
            onClick={() => navigate('/app/connections')}
          >
            Manage Connections
          </Button>
        </Box>
      </Paper>
    </Box>
  );
};
