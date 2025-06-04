import React, { useEffect } from 'react';
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
  FormGroup,
  FormControlLabel,
  Checkbox,
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
  const { runCommand, output, error } = useCli();

  const [isLoadingDialog, setIsLoadingDialog] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');

  const [selectedPackages, setSelectedPackages] = React.useState({
    'dbt-core': true,
    'dbt-postgres': true,
    'dbt-snowflake': true,
    'dbt-bigquery': true,
    'dbt-redshift': true,
    'dbt-databricks': true,
  });

  const [installedPackages, setInstalledPackages] = React.useState<{[key: string]: string}>({});
  const [isCheckingPackages, setIsCheckingPackages] = React.useState(false);

  const packageDescriptions = {
    'dbt-core': 'The core dbt™ package (required)',
    'dbt-postgres': 'Adapter for PostgreSQL databases',
    'dbt-snowflake': 'Adapter for Snowflake databases',
    'dbt-bigquery': 'Adapter for Google BigQuery',
    'dbt-redshift': 'Adapter for Amazon Redshift',
    'dbt-databricks': 'Adapter for Databricks',
  };

  const handlePackageToggle = (packageName: string) => {
    if (packageName === 'dbt-core') return; // Don't allow unchecking dbt-core

    setSelectedPackages(prev => ({
      ...prev,
      [packageName]: !prev[packageName as keyof typeof prev]
    }));
  };

  // Function to get dbt-core version
  const getDbtVersion = async (): Promise<string | null> => {
    try {
      const python = settings.pythonPath ? `"${settings.pythonPath}"` : 'python';
      console.log(`Checking dbt version using: ${python} -m pip show dbt-core`);
      const result = await runCommand(`${python} -m pip show dbt-core`);
      console.log('Command output:', result.output);
      console.log('Command error:', result.error);

      if (result.error.length > 0) {
        console.error('Error getting dbt version:', result.error);
        return null;
      }

      const outputText = result.output.join('\n');
      console.log('Full output text:', outputText);
      const versionMatch = outputText.match(/Version:\s*(.+)/);
      console.log('Version match:', versionMatch);
      return versionMatch ? versionMatch[1].trim() : null;
    } catch (error) {
      console.error('Failed to get dbt version:', error);
      return null;
    }
  };

  const handleInstallDbt = async () => {
    const allPackages = [
      'dbt-core',
      'dbt-postgres',
      'dbt-snowflake',
      'dbt-bigquery',
      'dbt-redshift',
      'dbt-databricks',
    ];

    const packages = allPackages.filter(pkg => selectedPackages[pkg as keyof typeof selectedPackages]);

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
      const allPackages = [
        'dbt-databricks',
        'dbt-redshift',
        'dbt-bigquery',
        'dbt-snowflake',
        'dbt-postgres',
        'dbt-core',
      ];

      const packages = allPackages.filter(pkg => selectedPackages[pkg as keyof typeof selectedPackages]);
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

  // Function to check installed packages
  const checkInstalledPackages = async (): Promise<void> => {
    if (isCheckingPackages) return; // Prevent multiple simultaneous checks

    setIsCheckingPackages(true);
    const python = settings.pythonPath ? `"${settings.pythonPath}"` : 'python';
    const packages = Object.keys(packageDescriptions);
    const installed: {[key: string]: string} = {};

    try {
      // Check all packages in a single command to avoid conflicts
      const result = await runCommand(`${python} -m pip list --format=json`);

      if (result.output.length > 0 && result.error.length === 0) {
        const outputText = result.output.join('\n').trim();
        console.log('Raw pip list output:', outputText);

        try {
          // Extract only the JSON part - look for the array that starts with [ and ends with ]
          // Split by lines and find the JSON array
          const lines = outputText.split('\n');
          let jsonStartIndex = -1;
          let jsonEndIndex = -1;

          // Find the start and end of the JSON array
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('[') && jsonStartIndex === -1) {
              jsonStartIndex = i;
            }
            if (line.endsWith(']') && jsonStartIndex !== -1 && jsonEndIndex === -1) {
              jsonEndIndex = i;
              break;
            }
          }

          if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            const jsonLines = lines.slice(jsonStartIndex, jsonEndIndex + 1);
            const jsonString = jsonLines.join('\n');
            console.log('Extracted JSON:', jsonString);

            const pipList = JSON.parse(jsonString);

            packages.forEach(pkg => {
              const found = pipList.find((item: any) => item.name === pkg);
              if (found) {
                installed[pkg] = found.version;
              }
            });

            console.log('Found installed packages:', installed);
          } else {
            console.warn('No valid JSON array found in pip list output');
            await checkPackagesIndividually(python, packages, installed);
          }
        } catch (parseError) {
          console.error('Failed to parse pip list output:', parseError);
          console.log('Attempting individual package checks...');
          await checkPackagesIndividually(python, packages, installed);
        }
      } else {
        console.log('No output or error in pip list, falling back to individual checks');
        await checkPackagesIndividually(python, packages, installed);
      }
    } catch (error) {
      console.error('Failed to check installed packages:', error);
      await checkPackagesIndividually(python, packages, installed);
    } finally {
      setInstalledPackages(installed);
      setIsCheckingPackages(false);
    }
  };

  // Fallback function for individual package checking
  const checkPackagesIndividually = async (python: string, packages: string[], installed: {[key: string]: string}) => {
    console.log('Checking packages individually...');

    for (const pkg of packages) {
      if (isCheckingPackages === false) break; // Exit if checking was cancelled

      try {
        // Add small delay between commands to prevent conflicts
        await new Promise(resolve => setTimeout(resolve, 200));

        console.log(`Checking package: ${pkg}`);
        const result = await runCommand(`${python} -m pip show ${pkg}`);

        if (result.output.length > 0 && result.error.length === 0) {
          const outputText = result.output.join('\n');
          const versionMatch = outputText.match(/Version:\s*(.+)/);
          if (versionMatch) {
            installed[pkg] = versionMatch[1].trim();
            console.log(`Found ${pkg} version ${installed[pkg]}`);
          }
        }
      } catch (error) {
        console.log(`Package ${pkg} not found or error occurred:`, error);
      }
    }
  };

  // Function to uninstall individual package
  const handleUninstallPackage = async (packageName: string) => {
    setIsLoadingInstall(true);
    setIsLoadingDialog(true);
    setLoadingMessage(`Uninstalling ${packageName}...`);

    try {
      const python = settings.pythonPath ? `"${settings.pythonPath}"` : 'python';
      await runCommand(`${python} -m pip uninstall -y ${packageName}`);

      // Remove from installed packages
      setInstalledPackages(prev => {
        const updated = { ...prev };
        delete updated[packageName];
        return updated;
      });

      // If dbt-core is uninstalled, clear the dbt path
      if (packageName === 'dbt-core') {
        onInstallDbtSave('dbtPath', '');
      }
    } catch (error) {
      console.error(`Failed to uninstall ${packageName}:`, error);
    } finally {
      setIsLoadingInstall(false);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  useEffect(() => {
    const fetchDbtVersion = async () => {
      if(settings.dbtPath && settings.dbtPath !== 'dbt' && settings.dbtVersion === '') {
        try {
          const version = await getDbtVersion();
          if (version) {
            onInstallDbtSave('dbtVersion', version);
          }
        } catch (error) {
          console.error('Failed to get dbt version:', error);
        }
      }
      if((!settings.dbtPath || settings.dbtPath === 'dbt') && settings.dbtVersion !== '') {
        onInstallDbtSave('dbtVersion', '');
      }
    };

    const initializePackageCheck = async () => {
      try {
        await fetchDbtVersion();

        // Check installed packages when component mounts or dbtPath changes
        if (settings.dbtPath && settings.dbtPath !== 'dbt' && !isCheckingPackages) {
          // Add delay to ensure previous commands complete
          setTimeout(() => {
            if (!isCheckingPackages) {
              checkInstalledPackages();
            }
          }, 1000);
        }
      } catch (error) {
        console.error('Error in initializePackageCheck:', error);
        setIsCheckingPackages(false);
      }
    };

    initializePackageCheck();

    // Cleanup function to prevent stuck loader
    return () => {
      setIsCheckingPackages(false);
    };
  }, [settings.dbtPath]);

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

      {(settings.dbtPath && settings.dbtPath !=='dbt') ? (
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
                Uninstall All
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

          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            Installed Packages
            {isCheckingPackages && <CircularProgress size={16} />}
            <Button
              size="small"
              onClick={checkInstalledPackages}
              disabled={isCheckingPackages}
            >
              Refresh
            </Button>
          </Typography>

          {Object.keys(installedPackages).length > 0 ? (
            <Box sx={{ mb: 2 }}>
              {Object.entries(installedPackages).map(([pkg, version]) => (
                <Alert
                  key={pkg}
                  severity="info"
                  sx={{ mb: 1 }}
                  action={
                    <Button
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => handleUninstallPackage(pkg)}
                      disabled={isLoadingInstall}
                    >
                      Uninstall
                    </Button>
                  }
                >
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {pkg} v{version}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {packageDescriptions[pkg as keyof typeof packageDescriptions]}
                    </Typography>
                  </Box>
                </Alert>
              ))}
            </Box>
          ) : (
            !isCheckingPackages && (
              <Alert severity="warning" sx={{ mb: 2 }}>
                No dbt packages found. You may need to reinstall dbt.
              </Alert>
            )
          )}
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

          <Typography variant="body2" sx={{ mb: 2, fontWeight: 'bold' }}>
            Select packages to install:
          </Typography>

          <FormGroup sx={{ mb: 2, ml: 2 }}>
            {Object.entries(packageDescriptions).map(([pkg, description]) => (
              <FormControlLabel
                key={pkg}
                control={
                  <Checkbox
                    checked={selectedPackages[pkg as keyof typeof selectedPackages]}
                    onChange={() => handlePackageToggle(pkg)}
                    disabled={pkg === 'dbt-core'} // dbt-core is always required
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" component="span" sx={{ fontWeight: 'medium' }}>
                      {pkg}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" component="div">
                      {description}
                    </Typography>
                  </Box>
                }
              />
            ))}
          </FormGroup>

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
              disabled={isLoadingInstall || Object.values(selectedPackages).every(v => !v)}
              startIcon={
                isLoadingInstall ? (
                  <CircularProgress size={14} color="inherit" />
                ) : null
              }
            >
              {isLoadingInstall ? 'Installing...' : `Install Selected Packages (${Object.values(selectedPackages).filter(Boolean).length})`}
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
