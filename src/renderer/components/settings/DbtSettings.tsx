import React from 'react';
import {
  TextField,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
  LinearProgress,
  Dialog,
  DialogContent,
} from '@mui/material';
import { Info } from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';

interface DbtSettingsProps {
  settings: SettingsType;
  onSettingsChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onFilePicker?: (name: keyof SettingsType, isDir: boolean, defaultPath?: string) => Promise<void>;
  onInstallDbtSave: (key: string, value: string) => void;
}

export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onSettingsChange,
  onFilePicker,
  onInstallDbtSave,
}) => {
  const [isLoadingInstall, setIsLoadingInstall] = React.useState(false);
  const [currentPackage, setCurrentPackage] = React.useState('');
  const [installProgress, setInstallProgress] = React.useState(0);
  const { runCommand, output } = useCli();

  const [isLoadingDialog, setIsLoadingDialog] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');

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
    setIsLoadingDialog(true);

    try {
      // Use existing Python path if available
      if (settings.pythonPath) {
        const python = `"${settings.pythonPath}"`;

        // Install pip first if needed
        setCurrentPackage('Setting up pip...');
        setLoadingMessage('Setting up pip...');
        try {
          await runCommand(`${python} -m ensurepip --upgrade`);
        } catch {
          /* Continue even if this fails */
        }

        for (let i = 0; i < packages.length; i++) {
          const pkg = packages[i];
          setCurrentPackage(pkg);
          setLoadingMessage(`Installing ${pkg}...`);
          setInstallProgress((i / packages.length) * 100);

          try {
            await runCommand(`${python} -m pip install ${pkg}`);
          } catch {
            /* Continue with next package */
          }
        }
      } else {
        try {
          for (let i = 0; i < packages.length; i++) {
            const pkg = packages[i];
            setCurrentPackage(pkg);
            setInstallProgress((i / packages.length) * 100);

            try {
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
    } finally {
      setIsLoadingInstall(false);
      setCurrentPackage('');
      setIsLoadingDialog(false);
    }
  };

  const handleUninstallDbt = async () => {
    setIsLoadingInstall(true);
    setCurrentPackage('Uninstalling dbt packages...');
    setIsLoadingDialog(true);

    try {
      const packages = [
        'dbt-databricks',
        'dbt-redshift',
        'dbt-bigquery',
        'dbt-snowflake',
        'dbt-postgres',
        'dbt-core',
      ];

      const python = settings.pythonPath ? `"${settings.pythonPath}"` : 'python';

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        setCurrentPackage(`Uninstalling ${pkg}...`);
        setLoadingMessage(`Uninstalling ${pkg}...`);
        setInstallProgress((i / packages.length) * 100);

        try {
          await runCommand(`${python} -m pip uninstall -y ${pkg}`);
        } catch {
          /* Continue with next package */
        }
      }

      onInstallDbtSave('dbtPath', '');
    } finally {
      setIsLoadingInstall(false);
      setCurrentPackage('');
      setInstallProgress(0);
      setIsLoadingDialog(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>


      <Box display="flex" alignItems="center" gap={1} sx={{ mb: 2 }}>
        <TextField
          fullWidth
          label="dbt Path"
          variant="outlined"
          id="dbtPath"
          name="dbtPath"
          value={settings.dbtPath}
          onChange={onSettingsChange}
          disabled
        />
      </Box>

      {settings.pythonPath && settings.pythonVersion && (
        <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
          Python environment (version {settings.pythonVersion}) is already
          installed at: {settings.pythonPath}
        </Alert>
      )}

      {settings.dbtPath ? (
        <Box sx={{ mt: 2 }}>
          <Alert
            severity="success"
            sx={{ mb: 2 }}
            action={
              <Button
                color="error"
                variant="outlined"
                onClick={handleUninstallDbt}
                disabled={isLoadingInstall}
                size="small"
              >
                Uninstall
              </Button>
            }
          >
            dbt™ is installed at: {settings.dbtPath}
            {settings?.dbtVersion && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Version: {settings?.dbtVersion}
              </Typography>
            )}
          </Alert>
        </Box>
      ) : (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="h6"
            gutterBottom
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 2,
            }}
          >
            <Info color="primary" />
            dbt™ Core Setup Required
          </Typography>

          <Typography variant="body1" sx={{ mb: 2 }}>
            Before continuing, you need to set up dbt™ Core and the necessary
            adapters on your system.
          </Typography>

          <Typography variant="body2" component="div" sx={{ mb: 2 }}>
            The following packages will be installed:
            <ul>
              <li>dbt-core: The core dbt™ package</li>
              <li>dbt-postgres: Adapter for PostgreSQL databases</li>
              <li>dbt-snowflake: Adapter for Snowflake databases</li>
              <li>dbt-bigquery: Adapter for Google BigQuery</li>
              <li>dbt-redshift: Adapter for Amazon Redshift</li>
              <li>dbt-databricks: Adapter for Databricks</li>
            </ul>
          </Typography>

          {isLoadingInstall && (
            <Box sx={{ width: '100%', mb: 2 }}>
              <Box
                sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}
              >
                <Typography variant="body2" color="text.secondary">
                  {currentPackage}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {Math.round(installProgress)}%
                </Typography>
              </Box>
              <LinearProgress variant="determinate" value={installProgress} />
            </Box>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => handleInstallDbt()}
              disabled={isLoadingInstall}
              startIcon={
                isLoadingInstall ? (
                  <CircularProgress size={14} color="inherit" />
                ) : null
              }
            >
              {isLoadingInstall ? 'Installing...' : 'Install dbt™ Packages'}
            </Button>
            <Button
              onClick={() => {
                window.open(
                  'https://docs.getdbt.com/docs/core/installation',
                  '_blank',
                );
              }}
              color="primary"
            >
              View Documentation
            </Button>
          </Box>
        </Box>
      )}
      <Dialog
        open={isLoadingDialog}
        fullWidth
        maxWidth="xs"
      >
        <DialogContent>
          <Box
            display="flex"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            py={3}
          >
            <CircularProgress size={60} />
            <Typography
              variant="h6"
              sx={{
                mt: 2,
                color: 'white',
                textAlign: 'center',
              }}
            >
              {loadingMessage || 'Loading...'}
            </Typography>
          </Box>
        </DialogContent>
      </Dialog>
    </Box>
  );
};
