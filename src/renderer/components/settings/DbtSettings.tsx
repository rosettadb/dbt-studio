/* eslint-disable no-restricted-syntax, no-await-in-loop, no-plusplus */
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
import {
  Info,
  Delete,
  Refresh,
  GetApp,
  Description,
  CloudDownload,
} from '@mui/icons-material';
import { SettingsType } from '../../../types/backend';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';

interface DbtSettingsProps {
  settings: SettingsType;
  onInstallDbtSave: (key: string, value: string) => void;
}

export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onInstallDbtSave,
}) => {
  const [isLoadingInstall, setIsLoadingInstall] = React.useState(false);
  const [currentPackage, setCurrentPackage] = React.useState('');
  const [installProgress, setInstallProgress] = React.useState(0);
  const { runCommand } = useCli();

  const [isLoadingDialog, setIsLoadingDialog] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');

  const [selectedPackages, setSelectedPackages] = React.useState({
    'dbt-core': true,
    'dbt-postgres': true,
    'dbt-snowflake': true,
    'dbt-bigquery': true,
    'dbt-redshift': true,
    'dbt-databricks': true,
    'dbt-duckdb': true,
    sqlglot: true,
  });

  const [installedPackages, setInstalledPackages] = React.useState<{
    [key: string]: string;
  }>({});
  const [isCheckingPackages, setIsCheckingPackages] = React.useState(false);

  const packageDescriptions = {
    'dbt-core': 'The core dbt™ package (required)',
    'dbt-postgres': 'Adapter for PostgreSQL databases',
    'dbt-snowflake': 'Adapter for Snowflake databases',
    'dbt-bigquery': 'Adapter for Google BigQuery',
    'dbt-redshift': 'Adapter for Amazon Redshift',
    'dbt-databricks': 'Adapter for Databricks',
    'dbt-duckdb': 'Adapter for DuckDB - embedded analytics database',
    sqlglot: 'SQL Parser and Transpiler (Required for Lineage)',
  };

  const handlePackageToggle = (packageName: string) => {
    if (packageName === 'dbt-core') return; // Don't allow unchecking dbt-core

    setSelectedPackages((prev) => ({
      ...prev,
      [packageName]: !prev[packageName as keyof typeof prev],
    }));
  };

  const getDbtVersion = async (): Promise<string | null> => {
    setIsLoadingDialog(true);
    setLoadingMessage('Checking dbt version...');

    try {
      const python = settings.pythonPath
        ? `"${settings.pythonPath}"`
        : 'python';
      const result = await runCommand(`${python} -m pip show dbt-core`);

      if (result.error.length > 0) {
        return null;
      }

      const outputText = result.output.join('\n');
      const versionMatch = outputText.match(/Version:\s*(.+)/);
      return versionMatch ? versionMatch[1].trim() : null;
    } catch (error) {
      return null;
    } finally {
      setIsLoadingDialog(false);
      setLoadingMessage('');
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
      'dbt-duckdb',
      'sqlglot',
    ];

    const packages = allPackages.filter(
      (pkg) => selectedPackages[pkg as keyof typeof selectedPackages],
    );

    setIsLoadingInstall(true);
    setInstallProgress(0);
    setIsLoadingDialog(true);

    try {
      if (settings.pythonPath) {
        const python = `"${settings.pythonPath}"`;

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
        'dbt-duckdb',
        'dbt-core',
      ];

      const packages = allPackages.filter(
        (pkg) => selectedPackages[pkg as keyof typeof selectedPackages],
      );
      const python = settings.pythonPath
        ? `"${settings.pythonPath}"`
        : 'python';

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

  const checkPackagesIndividually = async (
    python: string,
    packages: string[],
    installed: { [key: string]: string },
  ) => {
    for (const pkg of packages) {
      if (!isCheckingPackages) break;

      try {
        await new Promise((resolve) => {
          setTimeout(resolve, 200);
        });

        const result = await runCommand(`${python} -m pip show ${pkg}`);

        if (result.output.length > 0 && result.error.length === 0) {
          const outputText = result.output.join('\n');
          const versionMatch = outputText.match(/Version:\s*(.+)/);
          if (versionMatch) {
            installed[pkg] = versionMatch[1].trim();
          }
        }
      } catch {
        /* empty */
      }
    }
  };

  const checkInstalledPackages = async (): Promise<void> => {
    if (isCheckingPackages) return;

    setIsCheckingPackages(true);
    const python = settings.pythonPath ? `"${settings.pythonPath}"` : 'python';
    const packages = Object.keys(packageDescriptions);
    const installed: { [key: string]: string } = {};

    try {
      const result = await runCommand(`${python} -m pip list --format=json`);

      if (result.output.length > 0 && result.error.length === 0) {
        const outputText = result.output.join('\n').trim();

        try {
          const lines = outputText.split('\n');
          let jsonStartIndex = -1;
          let jsonEndIndex = -1;

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('[') && jsonStartIndex === -1) {
              jsonStartIndex = i;
            }
            if (
              line.endsWith(']') &&
              jsonStartIndex !== -1 &&
              jsonEndIndex === -1
            ) {
              jsonEndIndex = i;
              break;
            }
          }

          if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
            const jsonLines = lines.slice(jsonStartIndex, jsonEndIndex + 1);
            const jsonString = jsonLines.join('\n');

            const pipList = JSON.parse(jsonString);

            packages.forEach((pkg) => {
              const found = pipList.find((item: any) => item.name === pkg);
              if (found) {
                installed[pkg] = found.version;
              }
            });
          } else {
            await checkPackagesIndividually(python, packages, installed);
          }
        } catch (parseError) {
          await checkPackagesIndividually(python, packages, installed);
        }
      } else {
        await checkPackagesIndividually(python, packages, installed);
      }
    } catch (error) {
      await checkPackagesIndividually(python, packages, installed);
    } finally {
      setInstalledPackages(installed);
      setIsCheckingPackages(false);
    }
  };

  const handleUninstallPackage = async (packageName: string) => {
    setIsLoadingInstall(true);
    setIsLoadingDialog(true);
    setLoadingMessage(`Uninstalling ${packageName}...`);

    try {
      const python = settings.pythonPath
        ? `"${settings.pythonPath}"`
        : 'python';
      await runCommand(`${python} -m pip uninstall -y ${packageName}`);

      setInstalledPackages((prev) => {
        const updated = { ...prev };
        delete updated[packageName];
        return updated;
      });

      if (packageName === 'dbt-core') {
        onInstallDbtSave('dbtPath', '');
      }
    } finally {
      setIsLoadingInstall(false);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const handleInstallSinglePackage = async (packageName: string) => {
    setIsLoadingInstall(true);
    setIsLoadingDialog(true);
    setLoadingMessage(`Installing ${packageName}...`);

    try {
      const python = settings.pythonPath
        ? `"${settings.pythonPath}"`
        : 'python';
      await runCommand(`${python} -m pip install ${packageName}`);

      // Check if the package was installed successfully
      const result = await runCommand(`${python} -m pip show ${packageName}`);
      if (result.output.length > 0 && result.error.length === 0) {
        const outputText = result.output.join('\n');
        const versionMatch = outputText.match(/Version:\s*(.+)/);
        const version = versionMatch ? versionMatch[1].trim() : 'unknown';

        setInstalledPackages((prev) => ({
          ...prev,
          [packageName]: version,
        }));
      }
    } finally {
      setIsLoadingInstall(false);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  useEffect(() => {
    const fetchDbtVersion = async () => {
      if (
        settings.dbtPath &&
        settings.dbtPath !== 'dbt' &&
        settings.dbtVersion === ''
      ) {
        try {
          const version = await getDbtVersion();
          if (version) {
            onInstallDbtSave('dbtVersion', version);
          }
        } catch {
          /* empty */
        }
      }
      if (
        (!settings.dbtPath || settings.dbtPath === 'dbt') &&
        settings.dbtVersion !== ''
      ) {
        onInstallDbtSave('dbtVersion', '');
      }
    };

    const initializePackageCheck = async () => {
      try {
        await fetchDbtVersion();
        if (
          settings.dbtPath &&
          settings.dbtPath !== 'dbt' &&
          !isCheckingPackages
        ) {
          setTimeout(() => {
            if (!isCheckingPackages) {
              checkInstalledPackages();
            }
          }, 1000);
        }
      } catch (error) {
        setIsCheckingPackages(false);
      }
    };

    initializePackageCheck();

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
          disabled
        />
      </Box>

      {settings.pythonPath && settings.pythonVersion && (
        <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
          Python environment (version {settings.pythonVersion}) is already
          installed at: {settings.pythonPath}
        </Alert>
      )}

      {settings.dbtPath && settings.dbtPath !== 'dbt' ? (
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
                startIcon={<Delete />}
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

          <Typography
            variant="h6"
            sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            Installed Packages
            {isCheckingPackages && <CircularProgress size={16} />}
            <Button
              size="small"
              onClick={checkInstalledPackages}
              disabled={isCheckingPackages}
              startIcon={<Refresh />}
            >
              Refresh
            </Button>
          </Typography>

          {Object.keys(installedPackages).length > 0 ? (
            <Box sx={{ mb: 2 }}>
              {/* Show all packages from packageDescriptions, not just installed ones */}
              {Object.entries(packageDescriptions).map(([pkg, description]) => {
                const version = installedPackages[pkg];
                const isInstalled = !!version;

                return (
                  <Alert
                    key={pkg}
                    severity={isInstalled ? 'info' : 'warning'}
                    sx={{ mb: 1 }}
                    action={
                      isInstalled ? (
                        <Button
                          color="error"
                          variant="outlined"
                          size="small"
                          onClick={() => handleUninstallPackage(pkg)}
                          disabled={isLoadingInstall || pkg === 'dbt-core'}
                          startIcon={<Delete />}
                        >
                          Uninstall
                        </Button>
                      ) : (
                        <Button
                          color="primary"
                          variant="contained"
                          size="small"
                          onClick={() => handleInstallSinglePackage(pkg)}
                          disabled={isLoadingInstall}
                          startIcon={<GetApp />}
                        >
                          Install
                        </Button>
                      )
                    }
                  >
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {pkg} {isInstalled ? `v${version}` : '(not installed)'}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {description}
                      </Typography>
                    </Box>
                  </Alert>
                );
              })}
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
                    checked={
                      selectedPackages[pkg as keyof typeof selectedPackages]
                    }
                    onChange={() => handlePackageToggle(pkg)}
                    disabled={pkg === 'dbt-core'} // dbt-core is always required
                  />
                }
                label={
                  <Box>
                    <Typography
                      variant="body2"
                      component="span"
                      sx={{ fontWeight: 'medium' }}
                    >
                      {pkg}
                    </Typography>
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      component="div"
                    >
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
              disabled={
                isLoadingInstall ||
                Object.values(selectedPackages).every((v) => !v)
              }
              startIcon={
                isLoadingInstall ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <CloudDownload />
                )
              }
            >
              {isLoadingInstall
                ? 'Installing...'
                : `Install Selected Packages (${Object.values(selectedPackages).filter(Boolean).length})`}
            </Button>
            <Button
              onClick={() => {
                window.open(
                  'https://docs.getdbt.com/docs/core/installation',
                  '_blank',
                );
              }}
              color="primary"
              startIcon={<Description />}
            >
              View Documentation
            </Button>
          </Box>
        </Box>
      )}
      <Dialog open={isLoadingDialog} fullWidth maxWidth="xs">
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
