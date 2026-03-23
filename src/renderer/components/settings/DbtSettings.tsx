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
  Backdrop,
  FormGroup,
  FormControlLabel,
  Checkbox,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Info,
  Delete,
  Refresh,
  GetApp,
  Description,
  CloudDownload,
  Download,
  CheckCircle,
  ExpandMore,
} from '@mui/icons-material';
import {
  DbtVersionListResponse,
  PythonPackageVersionListResponse,
  SettingsType,
} from '../../../types/backend';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';
import {
  listDbtCoreVersions,
  installPackageVersion,
  listPackageVersions,
} from '../../services/dbtVersions.service';

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
  const [installingPackageKey, setInstallingPackageKey] = React.useState<
    string | null
  >(null);

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

  const [dbtCoreVersions, setDbtCoreVersions] =
    React.useState<DbtVersionListResponse | null>(null);
  const [isCheckingDbtCoreVersions, setIsCheckingDbtCoreVersions] =
    React.useState(false);

  const [packageVersions, setPackageVersions] = React.useState<
    Record<string, PythonPackageVersionListResponse | null>
  >({});
  const [isCheckingPackageVersions, setIsCheckingPackageVersions] =
    React.useState<Record<string, boolean>>({});
  const [expandedPackage, setExpandedPackage] = React.useState<string | false>(
    false,
  );

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

  const compareSimpleVersions = (a: string, b: string): number => {
    const parse = (v: string): number[] => {
      return v
        .replace(/^v/, '')
        .split('.')
        .map((x) => Number(x));
    };

    const aa = parse(a);
    const bb = parse(b);
    const maxLen = Math.max(aa.length, bb.length);

    for (let i = 0; i < maxLen; i += 1) {
      const av = aa[i] ?? 0;
      const bv = bb[i] ?? 0;
      if (av > bv) return 1;
      if (av < bv) return -1;
    }
    return 0;
  };

  const handlePackageToggle = (packageName: string) => {
    if (packageName === 'dbt-core') return; // Don't allow unchecking dbt-core

    setSelectedPackages((prev) => ({
      ...prev,
      [packageName]: !prev[packageName as keyof typeof prev],
    }));
  };

  async function getDbtVersion(): Promise<string | null> {
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
  }

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

  async function checkInstalledPackages(): Promise<void> {
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
  }

  const refreshDbtCoreVersions = async () => {
    setIsCheckingDbtCoreVersions(true);
    try {
      const data = await listDbtCoreVersions();
      setDbtCoreVersions(data);
    } finally {
      setIsCheckingDbtCoreVersions(false);
    }
  };

  const installSinglePackageVersion = async (
    packageName: string,
    version: string,
  ) => {
    setInstallingPackageKey(`${packageName}@${version}`);
    setIsLoadingDialog(true);
    setLoadingMessage(`Installing ${packageName}==${version}...`);
    try {
      const res = await installPackageVersion({
        pythonPath: settings.pythonPath,
        packageName,
        version,
      });

      if (!res.ok) {
        return;
      }

      if (packageName === 'dbt-core') {
        const installedVersion = await getDbtVersion();
        if (installedVersion) {
          onInstallDbtSave('dbtVersion', installedVersion);
        }
        await refreshDbtCoreVersions();
      }

      if (settings.dbtPath && settings.dbtPath !== 'dbt') {
        await checkInstalledPackages();
      }
    } finally {
      setInstallingPackageKey(null);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const handleInstallDbtCoreVersionClick = (version: string) => {
    installSinglePackageVersion('dbt-core', version).catch(() => undefined);
  };

  const fetchPackageVersions = async (packageName: string) => {
    setIsCheckingPackageVersions((prev) => ({
      ...prev,
      [packageName]: true,
    }));
    try {
      const data = await listPackageVersions({ packageName });
      setPackageVersions((prev) => ({
        ...prev,
        [packageName]: data,
      }));
    } finally {
      setIsCheckingPackageVersions((prev) => ({
        ...prev,
        [packageName]: false,
      }));
    }
  };

  const handlePackageAccordionChange = (packageName: string) => {
    return (_event: React.SyntheticEvent, isExpanded: boolean) => {
      const next = isExpanded ? packageName : false;
      setExpandedPackage(next);

      if (isExpanded && !packageVersions[packageName]) {
        fetchPackageVersions(packageName).catch(() => undefined);
      }
    };
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

  useEffect(() => {
    refreshDbtCoreVersions().catch(() => undefined);
  }, []);

  const handleRefreshDbtCoreVersionsClick = () => {
    refreshDbtCoreVersions().catch(() => undefined);
  };

  const handleRefreshInstalledPackagesClick = () => {
    checkInstalledPackages().catch(() => undefined);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 800 }}>
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
          <Alert severity="success" sx={{ mb: 2 }}>
            dbt™ is installed at: {settings.dbtPath}
            {settings?.dbtVersion && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Version: {settings?.dbtVersion}
              </Typography>
            )}
          </Alert>
        </Box>
      ) : null}

      <Box sx={{ mb: 3 }}>
        <Typography
          variant="h6"
          sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
        >
          Available dbt-core versions (latest 5)
          {isCheckingDbtCoreVersions && <CircularProgress size={16} />}
          <Button
            size="small"
            onClick={handleRefreshDbtCoreVersionsClick}
            disabled={isCheckingDbtCoreVersions}
            startIcon={<Refresh />}
          >
            Refresh
          </Button>
        </Typography>

        {(dbtCoreVersions?.versions ?? []).length > 0 ? (
          <List
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
            }}
          >
            {(dbtCoreVersions?.versions ?? []).map((item) => {
              const installed = settings.dbtVersion;
              const isInstalled = installed === item.version;
              const isLatest =
                item.version === (dbtCoreVersions?.latestStable ?? null);

              let actionLabel = 'Downgrade';
              if (isInstalled) {
                actionLabel = 'Installed';
              } else if (
                installed &&
                compareSimpleVersions(item.version, installed) > 0
              ) {
                actionLabel = 'Upgrade';
              }

              return (
                <React.Fragment key={item.version}>
                  <ListItem>
                    <ListItemText
                      primary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                          }}
                        >
                          <Typography variant="body1" sx={{ fontWeight: 500 }}>
                            {item.version}
                          </Typography>

                          {isInstalled && (
                            <Box
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.5,
                              }}
                            >
                              <CheckCircle color="success" fontSize="small" />
                              <Chip
                                label="Installed"
                                size="small"
                                color="success"
                              />
                            </Box>
                          )}

                          {isLatest && !item.isPrerelease && (
                            <Chip label="Latest" size="small" color="primary" />
                          )}
                        </Box>
                      }
                    />
                    <ListItemSecondaryAction>
                      <Button
                        size="small"
                        variant="contained"
                        onClick={() => {
                          handleInstallDbtCoreVersionClick(item.version);
                        }}
                        disabled={
                          isInstalled || isLoadingDialog || isLoadingInstall
                        }
                        startIcon={
                          installingPackageKey ===
                          `dbt-core@${item.version}` ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Download />
                          )
                        }
                      >
                        {actionLabel}
                      </Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                  <Divider />
                </React.Fragment>
              );
            })}
          </List>
        ) : (
          <Alert severity="info">No versions available.</Alert>
        )}
      </Box>

      <Box sx={{ mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Adapter packages
        </Typography>

        {(
          [
            'dbt-postgres',
            'dbt-snowflake',
            'dbt-bigquery',
            'dbt-redshift',
            'dbt-databricks',
            'dbt-duckdb',
          ] as const
        ).map((pkg) => {
          const installed = installedPackages[pkg];
          const versions = packageVersions[pkg]?.versions ?? [];
          const latestStable = packageVersions[pkg]?.latestStable ?? null;
          const isLoading = isCheckingPackageVersions[pkg] ?? false;

          return (
            <Accordion
              key={pkg}
              expanded={expandedPackage === pkg}
              onChange={handlePackageAccordionChange(pkg)}
              TransitionProps={{ timeout: 500 }}
              sx={{ mb: 1 }}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body1" sx={{ fontWeight: 500 }}>
                      {pkg}
                    </Typography>
                    {installed && (
                      <Chip
                        label={`v${installed}`}
                        size="small"
                        color="primary"
                        sx={{
                          height: 18,
                          '& .MuiChip-label': {
                            px: 0.75,
                            fontSize: '0.7rem',
                            lineHeight: 1,
                          },
                        }}
                      />
                    )}
                  </Box>
                  <Typography variant="body2" color="text.secondary">
                    {packageDescriptions[pkg]}
                  </Typography>
                </Box>
              </AccordionSummary>
              <AccordionDetails>
                <Box
                  sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
                >
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => {
                      fetchPackageVersions(pkg).catch(() => undefined);
                    }}
                    disabled={isLoading}
                    startIcon={
                      isLoading ? <CircularProgress size={16} /> : <Refresh />
                    }
                  >
                    {isLoading ? 'Loading...' : 'Load Versions'}
                  </Button>

                  {installed && (
                    <Button
                      color="error"
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        handleUninstallPackage(pkg).catch(() => undefined);
                      }}
                      disabled={isLoadingInstall || isLoadingDialog}
                      startIcon={<Delete />}
                    >
                      Uninstall
                    </Button>
                  )}
                </Box>

                {versions.length > 0 ? (
                  <List
                    sx={{
                      border: 1,
                      borderColor: 'divider',
                      borderRadius: 1,
                    }}
                  >
                    {versions.map((v) => {
                      const isInstalled = installed === v.version;
                      const isLatest = v.version === latestStable;

                      let actionLabel = 'Install';
                      if (isInstalled) {
                        actionLabel = 'Installed';
                      } else if (
                        installed &&
                        compareSimpleVersions(v.version, installed) > 0
                      ) {
                        actionLabel = 'Upgrade';
                      } else if (installed) {
                        actionLabel = 'Downgrade';
                      }

                      return (
                        <React.Fragment key={v.version}>
                          <ListItem>
                            <ListItemText
                              primary={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                  }}
                                >
                                  <Typography
                                    variant="body1"
                                    sx={{ fontWeight: 500 }}
                                  >
                                    {v.version}
                                  </Typography>

                                  {isInstalled && (
                                    <Box
                                      sx={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 0.5,
                                      }}
                                    >
                                      <CheckCircle
                                        color="success"
                                        fontSize="small"
                                      />
                                      <Chip
                                        label="Installed"
                                        size="small"
                                        color="success"
                                      />
                                    </Box>
                                  )}

                                  {isLatest && !v.isPrerelease && (
                                    <Chip
                                      label="Latest"
                                      size="small"
                                      color="primary"
                                    />
                                  )}
                                </Box>
                              }
                            />
                            <ListItemSecondaryAction>
                              <Button
                                size="small"
                                variant="contained"
                                onClick={() => {
                                  installSinglePackageVersion(
                                    pkg,
                                    v.version,
                                  ).catch(() => undefined);
                                }}
                                disabled={
                                  isInstalled ||
                                  isLoadingDialog ||
                                  isLoadingInstall
                                }
                                startIcon={
                                  installingPackageKey ===
                                  `${pkg}@${v.version}` ? (
                                    <CircularProgress size={16} />
                                  ) : (
                                    <Download />
                                  )
                                }
                              >
                                {actionLabel}
                              </Button>
                            </ListItemSecondaryAction>
                          </ListItem>
                          <Divider />
                        </React.Fragment>
                      );
                    })}
                  </List>
                ) : (
                  <Alert severity="info">
                    Click &quot;Load Versions&quot; to view versions.
                  </Alert>
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Box>

      {settings.dbtPath && settings.dbtPath !== 'dbt' ? (
        <Box sx={{ mt: 2 }}>
          <Typography
            variant="h6"
            sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}
          >
            Installed Packages
            {isCheckingPackages && <CircularProgress size={16} />}
            <Button
              size="small"
              onClick={handleRefreshInstalledPackagesClick}
              disabled={isCheckingPackages}
              startIcon={<Refresh />}
            >
              Refresh
            </Button>
          </Typography>

          {Object.keys(installedPackages).length > 0 ? (
            <Box sx={{ mb: 2 }}>
              {/* Show all packages from packageDescriptions, not just installed ones */}
              {Object.entries(packageDescriptions)
                .filter(([pkg]) => pkg === 'sqlglot')
                .map(([pkg, description]) => {
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
                            disabled={isLoadingInstall}
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
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 'medium' }}
                        >
                          {pkg}{' '}
                          {isInstalled ? `v${version}` : '(not installed)'}
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

      <Backdrop
        open={isLoadingDialog}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
      >
        <Box
          display="flex"
          flexDirection="column"
          alignItems="center"
          justifyContent="center"
          py={3}
        >
          <CircularProgress color="inherit" />
          <Typography
            variant="body2"
            sx={{
              mt: 2,
              textAlign: 'center',
            }}
          >
            {loadingMessage || 'Loading...'}
          </Typography>
        </Box>
      </Backdrop>
    </Box>
  );
};
