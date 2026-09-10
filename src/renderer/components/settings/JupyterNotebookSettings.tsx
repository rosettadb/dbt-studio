import React from 'react';
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemText,
  Typography,
} from '@mui/material';
import { CheckCircle, Warning } from '@mui/icons-material';
import { usePythonNotebookRuntimeStatus } from '../../controllers';

const statePresentation = {
  ready: { label: 'Ready', color: 'success' as const, icon: <CheckCircle /> },
  'not-installed': {
    label: 'Not installed',
    color: 'default' as const,
    icon: <Warning />,
  },
  'needs-attention': {
    label: 'Needs attention',
    color: 'warning' as const,
    icon: <Warning />,
  },
};

export const JupyterNotebookSettings: React.FC = () => {
  const { data: status, isLoading, isError } = usePythonNotebookRuntimeStatus();

  return (
    <Box sx={{ pt: 3, mt: 3, borderTop: 1, borderColor: 'divider' }}>
      <Typography variant="h6" gutterBottom>
        Jupyter Notebooks
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Uses Rosetta DBT Studio&apos;s managed Python with a dedicated
        environment for notebook packages.
      </Typography>

      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2">Checking Jupyter runtime…</Typography>
        </Box>
      )}

      {isError && (
        <Alert severity="warning">
          Could not read the Jupyter runtime status. Try refreshing this page.
        </Alert>
      )}

      {status && (
        <>
          <Alert
            severity={status.state === 'ready' ? 'success' : 'warning'}
            icon={statePresentation[status.state].icon}
            sx={{ mb: 2 }}
          >
            <Box
              sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}
            >
              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                Jupyter runtime
              </Typography>
              <Chip
                size="small"
                label={statePresentation[status.state].label}
                color={statePresentation[status.state].color}
              />
            </Box>
            <Typography variant="body2">
              Managed Python: {status.managedPython.version ?? 'Not installed'}
              {' · '}Requires Python {status.managedPython.minimumVersion}+
            </Typography>
            {status.message && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {status.message}
              </Typography>
            )}
          </Alert>

          <List
            dense
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1.5 }}
          >
            {status.packages.map((pkg, index) => (
              <React.Fragment key={pkg.name}>
                <ListItem>
                  <ListItemText
                    primary={pkg.name}
                    secondary={
                      pkg.installedVersion
                        ? `Installed ${pkg.installedVersion} · Required ${pkg.requiredVersion}`
                        : `Missing · Required ${pkg.requiredVersion}`
                    }
                  />
                  <Chip
                    size="small"
                    color={
                      pkg.installedVersion === pkg.requiredVersion
                        ? 'success'
                        : 'default'
                    }
                    label={
                      pkg.installedVersion === pkg.requiredVersion
                        ? 'Installed'
                        : 'Missing'
                    }
                  />
                </ListItem>
                {index < status.packages.length - 1 && (
                  <Divider component="li" />
                )}
              </React.Fragment>
            ))}
          </List>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            Environment location: {status.environmentPath}
          </Typography>
        </>
      )}
    </Box>
  );
};
