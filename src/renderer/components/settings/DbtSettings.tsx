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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
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
  DbtProjectCompatibilityResult,
  DbtVersionChangePlan,
  DbtVersionListResponse,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListResponse,
  SettingsType,
} from '../../../types/backend';
import {
  useCheckCurrentProjectCompatibility,
  useGetInstalledDbtCore,
  useGetInstalledPackages,
  useInstallDbtVersionChange,
  useInstallLatestPackage,
  useInstallPackageVersion,
  useListDbtCoreVersions,
  useListPackageVersions,
  usePlanDbtVersionChange,
  useUninstallPackage,
} from '../../controllers';

interface DbtSettingsProps {
  settings: SettingsType;
  onInstallDbtSave: (key: string, value: string) => void;
}

const RuntimeLanguageIcon = ({ language }: { language: 'python' | 'rust' }) => (
  <Box
    aria-hidden="true"
    sx={{
      width: 32,
      height: 32,
      flex: '0 0 auto',
      display: 'grid',
      placeItems: 'center',
      borderRadius: language === 'python' ? 1 : '50%',
      bgcolor: language === 'rust' ? '#ce422b' : undefined,
      background:
        language === 'python'
          ? 'linear-gradient(135deg, #3776ab 0%, #3776ab 52%, #ffd343 52%, #ffd343 100%)'
          : undefined,
      color: language === 'python' ? '#fff' : '#fff7f2',
      fontSize: '0.72rem',
      fontWeight: 800,
      letterSpacing: '-0.02em',
      boxShadow: 1,
      textShadow: '0 1px 2px rgba(0, 0, 0, 0.55)',
    }}
  >
    {language === 'python' ? 'Py' : 'Rs'}
  </Box>
);

export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onInstallDbtSave,
}) => {
  const [isLoadingInstall, setIsLoadingInstall] = React.useState(false);
  const [currentPackage, setCurrentPackage] = React.useState('');
  const [installProgress, setInstallProgress] = React.useState(0);
  const listDbtCoreVersions = useListDbtCoreVersions();
  const getInstalledDbtCore = useGetInstalledDbtCore();
  const getInstalledPackages = useGetInstalledPackages();
  const installPackageVersion = useInstallPackageVersion();
  const installLatestPackage = useInstallLatestPackage();
  const uninstallPackage = useUninstallPackage();
  const listPackageVersions = useListPackageVersions();
  const planDbtVersionChange = usePlanDbtVersionChange();
  const installDbtVersionChange = useInstallDbtVersionChange();
  const checkCurrentProjectCompatibility =
    useCheckCurrentProjectCompatibility();

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
  const [showOlderVersions, setShowOlderVersions] = React.useState(false);
  const [versionChangePlan, setVersionChangePlan] =
    React.useState<DbtVersionChangePlan | null>(null);
  const [isVersionChangeDialogOpen, setIsVersionChangeDialogOpen] =
    React.useState(false);
  const [runProjectCheck, setRunProjectCheck] = React.useState(true);
  const [versionChangeResult, setVersionChangeResult] =
    React.useState<PythonPackageInstallVersionResponse | null>(null);
  const [compatibilityResult, setCompatibilityResult] =
    React.useState<DbtProjectCompatibilityResult | null>(null);

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

  const getAdapterAlertSeverity = (
    status: 'likely-compatible' | 'warning' | 'unknown',
  ): 'success' | 'warning' | 'info' => {
    if (status === 'likely-compatible') return 'success';
    if (status === 'warning') return 'warning';
    return 'info';
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
      const installed = await getInstalledDbtCore();
      return installed.isExecutableVerified ? installed.version : null;
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
      if (!settings.pythonPath) {
        throw new Error(
          'Managed Python environment not found. Install Python first.',
        );
      }

      const availableDbtVersions =
        dbtCoreVersions ?? (await listDbtCoreVersions({ limit: 5 }));
      const targetDbtVersion = availableDbtVersions.latestStable;
      if (!targetDbtVersion) {
        throw new Error('No stable dbt-core version is available.');
      }

      for (let i = 0; i < packages.length; i++) {
        const pkg = packages[i];
        setCurrentPackage(pkg);
        setLoadingMessage(`Installing ${pkg}...`);
        setInstallProgress((i / packages.length) * 100);

        if (pkg === 'dbt-core') {
          const result = await installPackageVersion({
            pythonPath: settings.pythonPath,
            packageName: pkg,
            version: targetDbtVersion,
          });
          if (!result.ok) {
            setVersionChangeResult(result);
            break;
          }
          if (result.dbtPath) {
            onInstallDbtSave('dbtPath', result.dbtPath);
          }
          if (result.installedVersion) {
            onInstallDbtSave('dbtVersion', result.installedVersion);
          }
        } else {
          const result = await installLatestPackage({
            pythonPath: settings.pythonPath,
            packageName: pkg,
          });
          if (!result.ok) {
            setVersionChangeResult({
              ok: false,
              error: result.error || `Unable to install ${pkg}.`,
            });
          }
        }
      }
      setInstallProgress(100);
      // eslint-disable-next-line no-use-before-define
      await checkInstalledPackages();
    } finally {
      setIsLoadingInstall(false);
      setCurrentPackage('');
      setIsLoadingDialog(false);
    }
  };

  async function checkInstalledPackages(): Promise<void> {
    if (isCheckingPackages) return;

    setIsCheckingPackages(true);
    try {
      const result = await getInstalledPackages();
      setInstalledPackages(result.packages);
    } catch {
      setInstalledPackages({});
    } finally {
      setIsCheckingPackages(false);
    }
  }

  const refreshDbtCoreVersions = async () => {
    setIsCheckingDbtCoreVersions(true);
    try {
      const data = await listDbtCoreVersions({
        includePrerelease: true,
        limit: 100,
      });
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
        setVersionChangeResult(res);
        return;
      }
      await checkInstalledPackages();
    } finally {
      setInstallingPackageKey(null);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const prepareDbtVersionChange = async (version: string) => {
    setIsLoadingDialog(true);
    setLoadingMessage(`Planning dbt-core ${version} change...`);
    setVersionChangeResult(null);
    setCompatibilityResult(null);
    try {
      const plan = await planDbtVersionChange({
        targetVersion: version,
        includeAdapters: true,
      });
      setVersionChangePlan(plan);
      setRunProjectCheck(plan.isMajorVersionChange);
      setIsVersionChangeDialogOpen(true);
    } catch (error) {
      setVersionChangeResult({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unable to plan change.',
      });
    } finally {
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const confirmDbtVersionChange = async () => {
    if (!versionChangePlan) return;
    setIsVersionChangeDialogOpen(false);
    setIsLoadingDialog(true);
    setInstallingPackageKey(`dbt-core@${versionChangePlan.targetVersion}`);
    setLoadingMessage(
      `Installing dbt-core==${versionChangePlan.targetVersion}...`,
    );
    try {
      const result = await installDbtVersionChange({
        targetVersion: versionChangePlan.targetVersion,
        includeAdapters: true,
        pythonPath: settings.pythonPath,
      });
      setVersionChangeResult(result);
      if (result.ok) {
        if (result.dbtPath) onInstallDbtSave('dbtPath', result.dbtPath);
        if (result.installedVersion) {
          onInstallDbtSave('dbtVersion', result.installedVersion);
        }
        await refreshDbtCoreVersions();
        await checkInstalledPackages();
        if (runProjectCheck) {
          setLoadingMessage(
            'Checking the current project with dbt parse and compile...',
          );
          setCompatibilityResult(await checkCurrentProjectCompatibility());
        }
      }
    } catch (error) {
      setVersionChangeResult({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Version change failed.',
      });
    } finally {
      setInstallingPackageKey(null);
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const handleRollback = () => {
    if (!versionChangeResult?.previousVersion) return;
    prepareDbtVersionChange(versionChangeResult.previousVersion).catch(
      () => undefined,
    );
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
      const result = await uninstallPackage({
        pythonPath: settings.pythonPath,
        packageName,
      });
      if (!result.ok) {
        setVersionChangeResult(result);
        return;
      }

      setInstalledPackages((prev) => {
        const updated = { ...prev };
        delete updated[packageName];
        return updated;
      });

      if (packageName === 'dbt-core') {
        onInstallDbtSave('dbtPath', '');
        onInstallDbtSave('dbtVersion', '');
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
      const result = await installLatestPackage({
        pythonPath: settings.pythonPath,
        packageName,
      });
      if (result.ok && result.installedVersion) {
        setInstalledPackages((prev) => ({
          ...prev,
          [packageName]: result.installedVersion as string,
        }));
      } else if (!result.ok) {
        setVersionChangeResult(result);
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

  const availableVersions = dbtCoreVersions?.versions ?? [];
  const pythonDbtVersions = availableVersions
    .filter(
      (item) => Number.parseInt(item.version, 10) === 1 && !item.isPrerelease,
    )
    .slice(0, showOlderVersions ? 15 : 5);
  const rustDbtVersions = availableVersions
    .filter((item) => Number.parseInt(item.version, 10) >= 2)
    .slice(0, showOlderVersions ? 15 : 5);

  const renderVersionList = (
    versions: DbtVersionListResponse['versions'],
    emptyMessage: string,
  ) => {
    if (versions.length === 0) {
      return <Alert severity="info">{emptyMessage}</Alert>;
    }

    return (
      <List
        disablePadding
        sx={{
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {versions.map((item, index) => {
          const installed = settings.dbtVersion;
          const isInstalled = item.isInstalled || installed === item.version;
          const isLatest = item.isLatestStable;

          let actionLabel = installed ? 'Downgrade' : 'Install';
          if (isInstalled) {
            actionLabel = 'Installed';
          } else if (item.isPrerelease) {
            actionLabel = 'Install Preview';
          } else if (
            installed &&
            compareSimpleVersions(item.version, installed) > 0
          ) {
            actionLabel = 'Upgrade';
          }

          return (
            <React.Fragment key={item.version}>
              <ListItem sx={{ pr: 17, minHeight: 56 }}>
                <ListItemText
                  primary={
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.75,
                        flexWrap: 'wrap',
                      }}
                    >
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {item.version}
                      </Typography>
                      {isInstalled && (
                        <>
                          <CheckCircle color="success" fontSize="small" />
                          <Chip
                            label="Installed"
                            size="small"
                            color="success"
                          />
                        </>
                      )}
                      {isLatest && !item.isPrerelease && (
                        <Chip label="Latest stable" size="small" />
                      )}
                      {item.isPrerelease && (
                        <Chip label="Preview" size="small" color="warning" />
                      )}
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={() => {
                      prepareDbtVersionChange(item.version).catch(
                        () => undefined,
                      );
                    }}
                    disabled={
                      isInstalled || isLoadingDialog || isLoadingInstall
                    }
                    startIcon={
                      installingPackageKey === `dbt-core@${item.version}` ? (
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
              {index < versions.length - 1 && <Divider />}
            </React.Fragment>
          );
        })}
      </List>
    );
  };

  return (
    <Box sx={{ p: 2, maxWidth: 1200 }}>
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
            {settings.dbtVersion?.startsWith('2.')
              ? 'dbt Core v2 (Rust)'
              : 'dbt Core v1 (Python)'}{' '}
            is active at: {settings.dbtPath}
            {settings?.dbtVersion && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Version: {settings?.dbtVersion}
              </Typography>
            )}
          </Alert>
        </Box>
      ) : null}

      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            mb: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            flexWrap: 'wrap',
          }}
        >
          <Box>
            <Typography variant="h6">Available dbt runtimes</Typography>
            <Typography variant="body2" color="text.secondary">
              Rosetta DBT Studio supports both dbt Core v1 (Python) and dbt Core
              v2 (Rust).
            </Typography>
          </Box>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {isCheckingDbtCoreVersions && <CircularProgress size={16} />}
            <Button
              size="small"
              onClick={handleRefreshDbtCoreVersionsClick}
              disabled={isCheckingDbtCoreVersions}
              startIcon={<Refresh />}
            >
              Refresh
            </Button>
            <Button
              size="small"
              onClick={() => setShowOlderVersions((value) => !value)}
            >
              {showOlderVersions
                ? 'Show fewer versions'
                : 'Show older versions'}
            </Button>
          </Box>
        </Box>

        <Alert severity="info" sx={{ mb: 2 }}>
          Changing the active dbt runtime affects all local projects. Preview
          versions are hidden by default and should be tested before production
          use.
        </Alert>

        {versionChangeResult && (
          <Alert
            severity={versionChangeResult.ok ? 'success' : 'error'}
            sx={{ mb: 2 }}
          >
            {versionChangeResult.ok
              ? `Verified dbt-core ${versionChangeResult.installedVersion} is now active.`
              : versionChangeResult.error ||
                'The dbt-core version change failed.'}
            {versionChangeResult.ok && versionChangeResult.previousVersion && (
              <Button size="small" sx={{ ml: 2 }} onClick={handleRollback}>
                Roll back to {versionChangeResult.previousVersion}
              </Button>
            )}
          </Alert>
        )}

        {compatibilityResult && (
          <Alert
            severity={compatibilityResult.ok ? 'success' : 'warning'}
            sx={{ mb: 2 }}
          >
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {compatibilityResult.ok
                ? `Project ${compatibilityResult.projectName} passed dbt parse and compile.`
                : `Project ${compatibilityResult.projectName || ''} has migration diagnostics.`}
            </Typography>
            {compatibilityResult.error && (
              <Typography variant="body2">
                {compatibilityResult.error}
              </Typography>
            )}
            {compatibilityResult.diagnostics
              .filter((diagnostic) => !diagnostic.ok)
              .map((diagnostic) => (
                <Box key={diagnostic.command} sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    dbt {diagnostic.command} failed
                  </Typography>
                  <Typography
                    component="pre"
                    variant="caption"
                    sx={{
                      whiteSpace: 'pre-wrap',
                      maxHeight: 180,
                      overflow: 'auto',
                    }}
                  >
                    {diagnostic.summary}
                  </Typography>
                </Box>
              ))}
            {compatibilityResult.recommendations.map((recommendation) => (
              <Typography key={recommendation} variant="body2" sx={{ mt: 1 }}>
                {recommendation}
              </Typography>
            ))}
          </Alert>
        )}

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'minmax(0, 1fr)',
              lg: 'repeat(2, minmax(0, 1fr))',
            },
            gap: 2,
          }}
        >
          <Box
            component="section"
            aria-labelledby="python-dbt-runtime-title"
            sx={{
              p: 2,
              border: 1,
              borderColor: settings.dbtVersion?.startsWith('1.')
                ? 'success.main'
                : 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RuntimeLanguageIcon language="python" />
                <Box>
                  <Typography
                    id="python-dbt-runtime-title"
                    variant="subtitle1"
                    sx={{ fontWeight: 700 }}
                  >
                    dbt Core v1
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Python engine · Stable runtime
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <Chip label="Python" size="small" variant="outlined" />
                <Chip label="Supported" size="small" color="success" />
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Recommended for production projects and broad adapter
              compatibility.
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              {renderVersionList(
                pythonDbtVersions,
                'No dbt Core v1 releases are available.',
              )}
            </Box>
          </Box>

          <Box
            component="section"
            aria-labelledby="rust-dbt-runtime-title"
            sx={{
              p: 2,
              border: 1,
              borderColor: settings.dbtVersion?.startsWith('2.')
                ? 'success.main'
                : 'divider',
              borderRadius: 2,
              bgcolor: 'background.paper',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 1,
                mb: 1.5,
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <RuntimeLanguageIcon language="rust" />
                <Box>
                  <Typography
                    id="rust-dbt-runtime-title"
                    variant="subtitle1"
                    sx={{ fontWeight: 700 }}
                  >
                    dbt Core v2
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Rust engine · Preview runtime
                  </Typography>
                </Box>
              </Box>
              <Box
                sx={{
                  display: 'flex',
                  gap: 0.75,
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <Chip label="Rust" size="small" variant="outlined" />
                <Chip label="Supported" size="small" color="success" />
                <Chip label="Preview" size="small" color="warning" />
              </Box>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Preview releases are available in Rosetta DBT Studio. Validate
              project and adapter compatibility before production use.
            </Typography>
            <Box sx={{ mt: 1.5 }}>
              {renderVersionList(
                rustDbtVersions,
                'No dbt Core v2 preview releases are available.',
              )}
            </Box>
          </Box>
        </Box>
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

      <Dialog
        open={isVersionChangeDialogOpen}
        onClose={() => setIsVersionChangeDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Confirm global dbt-core version change</DialogTitle>
        <DialogContent>
          {versionChangePlan && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="body2">
                Current version:{' '}
                {versionChangePlan.currentVersion || 'Not installed'}
              </Typography>
              <Typography variant="body2">
                Target version: {versionChangePlan.targetVersion}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Change: {versionChangePlan.direction} (
                {versionChangePlan.channel})
              </Typography>

              <Alert
                severity={
                  versionChangePlan.isMajorVersionChange ? 'warning' : 'info'
                }
                sx={{ mb: 2 }}
              >
                {versionChangePlan.globalImpactWarning}
              </Alert>

              {versionChangePlan.warnings.map((warning) => (
                <Alert key={warning} severity="warning" sx={{ mb: 1 }}>
                  {warning}
                </Alert>
              ))}

              {versionChangePlan.adapters.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Installed adapter compatibility
                  </Typography>
                  {versionChangePlan.adapters.map((adapter) => (
                    <Alert
                      key={adapter.packageName}
                      severity={getAdapterAlertSeverity(adapter.status)}
                      sx={{ mb: 1 }}
                    >
                      {adapter.packageName} {adapter.installedVersion}:{' '}
                      {adapter.message}
                    </Alert>
                  ))}
                </Box>
              )}

              {(versionChangePlan.channel === 'preview' ||
                versionChangePlan.targetVersion.startsWith('2.')) && (
                <Alert severity="info" sx={{ mt: 2 }}>
                  Rosetta will install only the Apache-licensed dbt-core package
                  and will block an ambiguous or proprietary dbt distribution.
                </Alert>
              )}

              <FormControlLabel
                sx={{ mt: 2 }}
                control={
                  <Checkbox
                    checked={runProjectCheck}
                    onChange={(event) =>
                      setRunProjectCheck(event.target.checked)
                    }
                  />
                }
                label="Check current project after install (dbt parse and compile)"
              />
              <Typography
                variant="caption"
                color="text.secondary"
                display="block"
              >
                Artifacts and logs are redirected to a temporary directory. dbt
                deps is not run automatically because it can modify dependencies
                and require network access.
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsVersionChangeDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmDbtVersionChange}>
            Confirm version change
          </Button>
        </DialogActions>
      </Dialog>

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
