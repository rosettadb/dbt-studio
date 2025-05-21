import React from 'react';
import {
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
  LinearProgress,
} from '@mui/material';
import { FolderOpen, Info } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';

interface DbtSettingsProps {
  settings: SettingsType;
  onSettingsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onInstallDbtSave: (key: string, value: string) => void;
  onFilePicker: (
    name: keyof SettingsType,
    isDir: boolean,
    defaultPath?: string,
  ) => void;
}

export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onSettingsChange,
  onFilePicker,
  onInstallDbtSave,
}) => {
  const [isLoadingInstall, setIsLoadingInstall] = React.useState(false);
  const [dbtSetupModalOpen, setDbtSetupModalOpen] = React.useState(false);
  const [currentPackage, setCurrentPackage] = React.useState('');
  const [installProgress, setInstallProgress] = React.useState(0);
  const { runCommand } = useCli();

  const handleInstallDbt = async () => {
    const packages = [
      'dbt-core',
      'dbt-postgres',
      'dbt-snowflake',
      'dbt-bigquery',
      'dbt-redshift',
      'dbt-databricks',
    ];

    setIsLoadingInstall(true);
    setInstallProgress(0);

    try {
      // Use existing Python path if available
      if (settings.pythonPath) {
        const python = `"${settings.pythonPath}"`;

        // Install pip first if needed
        setCurrentPackage('Setting up pip...');
        try {
          await runCommand(`${python} -m ensurepip --upgrade`);
        } catch {
          /* Continue even if this fails */
        }

        // eslint-disable-next-line no-plusplus
        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i];
          setCurrentPackage(pkg);
          setInstallProgress((i / packages.length) * 100);

          try {
            // eslint-disable-next-line no-await-in-loop
            await runCommand(`${python} -m pip install ${pkg}`);
          } catch {
            /* Continue with next package */
          }
        }
      } else {
        // If no Python path is set, use system Python
        try {
          // eslint-disable-next-line no-plusplus
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            setCurrentPackage(pkg);
            setInstallProgress((i / packages.length) * 100);

            try {
              // eslint-disable-next-line no-await-in-loop
              await runCommand(`pip install ${pkg}`);
            } catch {
              /* Continue with next package */
            }
          }
        } catch {
          /* empty */
        }
      }

      // Get and save the dbt path
      setCurrentPackage('Locating dbt path...');
      setInstallProgress(100);
      const dbtPath = await settingsServices.getDbtPath();
      onInstallDbtSave('dbtPath', dbtPath);

      // Close the modal after successful installation
      setDbtSetupModalOpen(false);
    } finally {
      setIsLoadingInstall(false);
      setCurrentPackage('');
    }
  };

  return (
    <>
      <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="dbt Path"
          variant="outlined"
          id="dbtPath"
          name="dbtPath"
          value={settings.dbtPath}
          onChange={onSettingsChange}
          slotProps={{
            input: {
              endAdornment: (
                <>
                  <IconButton
                    onClick={() => setDbtSetupModalOpen(true)}
                    edge="end"
                    color="primary"
                    style={{ marginRight: '8px' }}
                  >
                    <Info />
                  </IconButton>
                  <IconButton
                    onClick={() =>
                      onFilePicker('dbtPath', false, settings.dbtPath)
                    }
                    edge="end"
                  >
                    <FolderOpen />
                  </IconButton>
                </>
              ),
            },
          }}
        />
      </Box>

      <Dialog
        open={dbtSetupModalOpen}
        onClose={() => setDbtSetupModalOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Info color="primary" />
            dbt™ Core Setup Required
          </div>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1">
            Before continuing, you need to set up dbt™ Core and the necessary
            adapters on your system.
          </Typography>

          {settings.pythonPath && settings.pythonVersion && (
            <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
              Python environment (version {settings.pythonVersion}) is already
              installed at: {settings.pythonPath}
            </Alert>
          )}

          <Box
            sx={{
              mt: 3,
              mb: 3,
              p: 2,
              bgcolor: 'background.paper',
              borderRadius: 1,
              border: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="h6" gutterBottom>
              Automated Installation
            </Typography>

            {settings.dbtPath ? (
              <Alert severity="success" sx={{ mt: 2, mb: 2 }}>
                dbt™ packages are already installed and configured at:{' '}
                {settings.dbtPath}
              </Alert>
            ) : (
              <>
                <Typography variant="body1" gutterBottom>
                  Click the Install button below to automatically install dbt™
                  Core and all necessary adapters:
                </Typography>
                <Box sx={{ mt: 2, mb: 2 }}>
                  <Typography variant="body2" component="div">
                    <ul>
                      <li>dbt-core: The core dbt™ package</li>
                      <li>dbt-postgres: Adapter for PostgreSQL databases</li>
                      <li>dbt-snowflake: Adapter for Snowflake databases</li>
                      <li>dbt-bigquery: Adapter for Google BigQuery</li>
                      <li>dbt-redshift: Adapter for Amazon Redshift</li>
                      <li>dbt-databricks: Adapter for Databricks</li>
                    </ul>
                  </Typography>
                </Box>

                {isLoadingInstall && (
                  <Box sx={{ width: '100%', mb: 2 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        mb: 1,
                      }}
                    >
                      <Typography variant="body2" color="text.secondary">
                        Installing: {currentPackage}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {Math.round(installProgress)}%
                      </Typography>
                    </Box>
                    <LinearProgress
                      variant="determinate"
                      value={installProgress}
                    />
                  </Box>
                )}

                <Box
                  sx={{ mt: 2, display: 'flex', justifyContent: 'flex-start' }}
                >
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleInstallDbt}
                    disabled={isLoadingInstall || !!settings.dbtPath}
                    startIcon={
                      isLoadingInstall ? (
                        <CircularProgress size={14} color="inherit" />
                      ) : null
                    }
                  >
                    {isLoadingInstall
                      ? 'Installing...'
                      : 'Install dbt™ Packages'}
                  </Button>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              window.open(
                'https://docs.getdbt.com/docs/core/installation',
                '_blank',
              );
            }}
            color="primary"
          >
            Open Documentation
          </Button>
          <Button
            onClick={() => setDbtSetupModalOpen(false)}
            color="primary"
            variant="contained"
            disabled={isLoadingInstall}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
