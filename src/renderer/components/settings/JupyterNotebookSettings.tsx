import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Backdrop,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  List,
  ListItem,
  ListItemSecondaryAction,
  ListItemText,
  TextField,
  Typography,
} from '@mui/material';
import {
  CheckCircle,
  CloudDownload,
  Delete,
  Download,
  ExpandMore,
  Refresh,
  Warning,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  useCheckPythonNotebookRuntime,
  useInstallPythonNotebookPackage,
  useInstallPythonNotebookRuntime,
  useUpdatePythonNotebookRuntime,
  useListPythonNotebookPackageVersions,
  useUninstallPythonNotebookPackage,
  usePythonNotebookRuntimeStatus,
  useInstallPythonUserPackage,
  useUninstallPythonUserPackage,
  useListPythonUserPackageVersions,
} from '../../controllers';
import { ConfirmationModal } from '../modals';
import { icons } from '../../../../assets';
import {
  PythonNotebookPackageStatus,
  PythonNotebookPackageVersionListResponse,
  PythonNotebookUserPackageVersionListResponse,
} from '../../../types/notebooks';

const statePresentation = {
  ready: { label: 'Ready', color: 'success' as const, icon: <CheckCircle /> },
  'not-installed': {
    label: 'Not installed',
    color: 'default' as const,
    icon: <Warning />,
  },
  installing: {
    label: 'Installing',
    color: 'primary' as const,
    icon: <CircularProgress size={18} />,
  },
  updating: {
    label: 'Updating',
    color: 'primary' as const,
    icon: <CircularProgress size={18} />,
  },
  uninstalling: {
    label: 'Uninstalling',
    color: 'primary' as const,
    icon: <CircularProgress size={18} />,
  },
  'needs-attention': {
    label: 'Needs attention',
    color: 'warning' as const,
    icon: <Warning />,
  },
};

const optionalPackages = [
  ['numpy', 'Numerical arrays'],
  ['pandas', 'DataFrames'],
  ['polars', 'Fast DataFrames'],
  ['pyarrow', 'Arrow and Parquet'],
  ['duckdb', 'Local analytical SQL'],
  ['matplotlib', 'Charts'],
  ['seaborn', 'Statistical charts'],
  ['plotly', 'Interactive charts'],
  ['scipy', 'Scientific computing'],
  ['scikit-learn', 'Machine learning'],
  ['sqlalchemy', 'Database access'],
  ['psycopg', 'PostgreSQL access'],
  ['requests', 'HTTP requests'],
  ['boto3', 'AWS services'],
  ['fsspec', 'Filesystem adapters'],
  ['s3fs', 'S3 files'],
  ['pyiceberg', 'Iceberg tables'],
  ['deltalake', 'Delta tables'],
  ['pyspark', 'Spark Python API'],
  ['openpyxl', 'Excel files'],
] as const;

export const JupyterNotebookSettings: React.FC = () => {
  const navigate = useNavigate();
  const [packageVersions, setPackageVersions] = React.useState<
    Partial<
      Record<
        PythonNotebookPackageStatus['name'],
        PythonNotebookPackageVersionListResponse
      >
    >
  >({});
  const [loadingVersions, setLoadingVersions] = React.useState<
    Partial<Record<PythonNotebookPackageStatus['name'], boolean>>
  >({});
  const [expandedPackage, setExpandedPackage] = React.useState<
    PythonNotebookPackageStatus['name'] | false
  >(false);
  const [installingPackageKey, setInstallingPackageKey] = React.useState<
    string | null
  >(null);
  const [pendingPackageAction, setPendingPackageAction] = React.useState<{
    kind: 'install' | 'uninstall';
    packageName: PythonNotebookPackageStatus['name'];
    version?: string;
  } | null>(null);
  // Phase 11: environment selection and user package management.
  const [userPackageName, setUserPackageName] = React.useState('');
  const [userPackageExtras, setUserPackageExtras] = React.useState('');
  const [userPackageVersion, setUserPackageVersion] = React.useState('');
  const [userPackageVersions, setUserPackageVersions] =
    React.useState<PythonNotebookUserPackageVersionListResponse | null>(null);
  const [pendingEnvAction, setPendingEnvAction] = React.useState<{
    title: string;
    question: string;
    run: () => void;
  } | null>(null);
  const { data: status, isLoading, isError } = usePythonNotebookRuntimeStatus();
  const installRuntime = useInstallPythonNotebookRuntime();
  const updateRuntime = useUpdatePythonNotebookRuntime();
  const checkRuntime = useCheckPythonNotebookRuntime();
  const listPackageVersions = useListPythonNotebookPackageVersions();
  const installPackage = useInstallPythonNotebookPackage();
  const uninstallPackage = useUninstallPythonNotebookPackage();
  const installUserPackage = useInstallPythonUserPackage();
  const uninstallUserPackage = useUninstallPythonUserPackage();
  const listUserPackageVersions = useListPythonUserPackageVersions();
  const operationActive = Boolean(status && status.operation.state !== 'idle');
  const isBusy = Boolean(
    operationActive ||
      installRuntime.isLoading ||
      updateRuntime.isLoading ||
      installPackage.isLoading ||
      uninstallPackage.isLoading ||
      checkRuntime.isLoading ||
      installUserPackage.isLoading ||
      uninstallUserPackage.isLoading,
  );
  let blockingMessage =
    status?.operation.message || 'Checking the Jupyter runtime…';
  if (installRuntime.isLoading) {
    blockingMessage = 'Installing Jupyter packages…';
  } else if (installPackage.isLoading) {
    blockingMessage = 'Changing Jupyter package version…';
  } else if (uninstallPackage.isLoading) {
    blockingMessage = 'Uninstalling Jupyter packages…';
  }

  const activeSessionCount = status?.activeSessionCount ?? 0;
  const confirmQuestion =
    pendingPackageAction?.kind === 'install'
      ? `Change ${pendingPackageAction.packageName} to ${pendingPackageAction.version}? This will stop ${activeSessionCount} active Python notebook kernel${activeSessionCount === 1 ? '' : 's'} and variables will be lost. Saved notebooks are preserved.`
      : `Uninstall ${pendingPackageAction?.packageName}? This will stop ${activeSessionCount} active Python notebook kernel${activeSessionCount === 1 ? '' : 's'} and variables will be lost. Saved notebooks are preserved.`;

  const compareSimpleVersions = (a: string, b: string) => {
    const aParts = a.split('.').map((part) => Number.parseInt(part, 10) || 0);
    const bParts = b.split('.').map((part) => Number.parseInt(part, 10) || 0);
    for (
      let index = 0;
      index < Math.max(aParts.length, bParts.length);
      index += 1
    ) {
      const diff = (aParts[index] ?? 0) - (bParts[index] ?? 0);
      if (diff !== 0) return diff;
    }
    return 0;
  };

  const fetchPackageVersions = async (
    packageName: PythonNotebookPackageStatus['name'],
  ) => {
    setLoadingVersions((current) => ({ ...current, [packageName]: true }));
    try {
      const data = await listPackageVersions.mutateAsync(packageName);
      setPackageVersions((current) => ({ ...current, [packageName]: data }));
    } finally {
      setLoadingVersions((current) => ({ ...current, [packageName]: false }));
    }
  };

  const handlePackageAccordionChange =
    (packageName: PythonNotebookPackageStatus['name']) =>
    (_event: React.SyntheticEvent, expanded: boolean) => {
      setExpandedPackage(expanded ? packageName : false);
      if (expanded && !packageVersions[packageName]) {
        fetchPackageVersions(packageName).catch(() => undefined);
      }
    };

  const runPackageInstall = async (
    packageName: PythonNotebookPackageStatus['name'],
    version: string,
    expectedActiveSessionCount: number,
  ) => {
    setInstallingPackageKey(`${packageName}@${version}`);
    try {
      await installPackage.mutateAsync({
        packageName,
        version,
        expectedActiveSessionCount,
      });
      toast.success(`${packageName} ${version} installed`);
    } finally {
      setInstallingPackageKey(null);
    }
  };

  const runPackageUninstall = async (
    packageName: PythonNotebookPackageStatus['name'],
    expectedActiveSessionCount: number,
  ) => {
    setInstallingPackageKey(`${packageName}@uninstall`);
    try {
      await uninstallPackage.mutateAsync({
        packageName,
        expectedActiveSessionCount,
      });
      toast.success(`${packageName} uninstalled`);
    } finally {
      setInstallingPackageKey(null);
    }
  };

  const startPackageInstall = (
    packageName: PythonNotebookPackageStatus['name'],
    version: string,
  ) => {
    if (!status) return;
    if (status.activeSessionCount > 0) {
      setPendingPackageAction({ kind: 'install', packageName, version });
      return;
    }
    runPackageInstall(packageName, version, status.activeSessionCount).catch(
      () => undefined,
    );
  };

  const startPackageUninstall = (
    packageName: PythonNotebookPackageStatus['name'],
  ) => {
    if (!status) return;
    if (status.activeSessionCount > 0) {
      setPendingPackageAction({ kind: 'uninstall', packageName });
      return;
    }
    runPackageUninstall(packageName, status.activeSessionCount).catch(
      () => undefined,
    );
  };

  const confirmPackageAction = () => {
    if (!status || !pendingPackageAction) return;
    const expectedActiveSessionCount = status.activeSessionCount;
    if (
      pendingPackageAction.kind === 'install' &&
      pendingPackageAction.version
    ) {
      runPackageInstall(
        pendingPackageAction.packageName,
        pendingPackageAction.version,
        expectedActiveSessionCount,
      ).catch(() => undefined);
    } else {
      runPackageUninstall(
        pendingPackageAction.packageName,
        expectedActiveSessionCount,
      ).catch(() => undefined);
    }
    setPendingPackageAction(null);
  };

  // ─── Phase 11 helpers ────────────────────────────────────────────────────

  const kernelLossQuestion = (action: string) => {
    const count = status?.activeSessionCount ?? 0;
    return `${action} This will stop ${count} active Python notebook kernel${count === 1 ? '' : 's'} and variables will be lost. Saved notebooks are preserved.`;
  };

  const confirmOrRunEnvAction = (
    title: string,
    question: string,
    run: () => unknown,
  ) => {
    if ((status?.activeSessionCount ?? 0) > 0) {
      setPendingEnvAction({ title, question, run: () => run() });
      return;
    }
    run();
  };

  const notifyError = (error: unknown, fallback: string) => {
    toast.error(error instanceof Error ? error.message : fallback);
  };

  const parseExtras = (value: string) =>
    value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

  const startUserPackageInstall = () => {
    const name = userPackageName.trim();
    if (!name) {
      toast.error('Enter a Python package name.');
      return;
    }
    const extras = parseExtras(userPackageExtras);
    const version = userPackageVersion.trim() || undefined;
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    const spec = `${name}${extras.length > 0 ? `[${extras.join(',')}]` : ''}${version ? `==${version}` : ''}`;
    confirmOrRunEnvAction(
      'Install Python package',
      kernelLossQuestion(`Install ${spec} into the notebook environment?`),
      async () => {
        try {
          await installUserPackage.mutateAsync({
            name,
            extras,
            version,
            expectedActiveSessionCount,
          });
          toast.success(`${spec} installed`);
          setUserPackageVersion('');
        } catch (error) {
          notifyError(error, `Failed to install ${spec}.`);
        }
      },
    );
  };

  const startCatalogInstall = (name: string) => {
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    confirmOrRunEnvAction(
      'Install notebook package',
      kernelLossQuestion(
        `Install or update ${name} in the notebook environment?`,
      ),
      async () => {
        try {
          await installUserPackage.mutateAsync({
            name,
            extras: [],
            expectedActiveSessionCount,
          });
          toast.success(`${name} installed`);
        } catch (error) {
          notifyError(error, `Failed to install ${name}.`);
        }
      },
    );
  };

  const startInstallAllCatalogPackages = () => {
    confirmOrRunEnvAction(
      'Install all optional packages',
      kernelLossQuestion(
        `Install all ${optionalPackages.length} optional data packages in the notebook environment?`,
      ),
      async () => {
        try {
          await optionalPackages.reduce(
            (previous, [name]) =>
              previous.then(async () => {
                await installUserPackage.mutateAsync({
                  name,
                  extras: [],
                  expectedActiveSessionCount: 0,
                });
                return undefined;
              }),
            Promise.resolve(),
          );
          toast.success('All optional data packages installed');
        } catch (error) {
          notifyError(error, 'Failed to install all optional packages.');
        }
      },
    );
  };

  const startUninstallAllCatalogPackages = () => {
    const installedNames = optionalPackages
      .map(([name]) => name)
      .filter((name) =>
        status?.dataPackages.some(
          (pkg) => pkg.name === name && Boolean(pkg.installedVersion),
        ),
      );
    if (installedNames.length === 0) {
      toast.info('No optional data packages are installed.');
      return;
    }
    confirmOrRunEnvAction(
      'Uninstall all optional packages',
      kernelLossQuestion(
        `Uninstall ${installedNames.length} optional data package${installedNames.length === 1 ? '' : 's'}?`,
      ),
      async () => {
        try {
          await installedNames.reduce(
            (previous, name) =>
              previous.then(async () => {
                await uninstallUserPackage.mutateAsync({
                  name,
                  expectedActiveSessionCount: 0,
                });
                return undefined;
              }),
            Promise.resolve(),
          );
          toast.success('All optional data packages uninstalled');
        } catch (error) {
          notifyError(error, 'Failed to uninstall all optional packages.');
        }
      },
    );
  };

  const startUserPackageUninstall = (packageName: string) => {
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    confirmOrRunEnvAction(
      'Uninstall Python package',
      kernelLossQuestion(
        `Uninstall ${packageName} from the notebook environment?`,
      ),
      async () => {
        try {
          await uninstallUserPackage.mutateAsync({
            name: packageName,
            expectedActiveSessionCount,
          });
          toast.success(`${packageName} uninstalled`);
        } catch (error) {
          notifyError(error, `Failed to uninstall ${packageName}.`);
        }
      },
    );
  };

  const lookupUserPackageVersions = async (): Promise<void> => {
    const name = userPackageName.trim();
    if (!name) {
      toast.error('Enter a Python package name first.');
      return;
    }
    try {
      const data = await listUserPackageVersions.mutateAsync(name);
      setUserPackageVersions(data);
      if (!data.latestStable) {
        toast.error(`No versions found for ${name}.`);
      }
    } catch (error) {
      notifyError(error, `Failed to look up versions for ${name}.`);
    }
  };

  return (
    <Box sx={{ pt: 3, mt: 3, borderTop: 1, borderColor: 'divider' }}>
      <Backdrop
        open={isBusy}
        sx={{ zIndex: (t) => t.zIndex.drawer + 1, color: '#fff' }}
      >
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <CircularProgress color="inherit" />
          <Typography variant="body1">{blockingMessage}</Typography>
        </Box>
      </Backdrop>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <img
          src={icons.jupyterLogo}
          alt="Jupyter"
          style={{ width: 28, height: 28, objectFit: 'contain' }}
        />
        <Typography variant="h6">Jupyter Notebooks</Typography>
      </Box>
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
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Active Python kernels: {status.activeSessionCount}
            </Typography>
            <Typography
              variant="body2"
              sx={{ mt: 0.5, wordBreak: 'break-all' }}
            >
              Environment location: {status.environmentPath}
            </Typography>
            {status.message && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {status.message}
              </Typography>
            )}
          </Alert>

          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            Notebook environment
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 2, wordBreak: 'break-all' }}
          >
            Managed by Studio for all notebooks.
          </Typography>
          {!status.managedPython.available && (
            <Alert
              severity="info"
              sx={{ mb: 2 }}
              action={
                <Button
                  size="small"
                  onClick={() => navigate('/app/settings/python')}
                  startIcon={<CloudDownload />}
                >
                  Install Python first
                </Button>
              }
            >
              Install Python in Settings → Python, then return here.
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <Button
              variant="outlined"
              onClick={() => checkRuntime.mutate()}
              disabled={status.state === 'not-installed' || isBusy}
              startIcon={<Refresh />}
            >
              Check Runtime
            </Button>
          </Box>
          {checkRuntime.isSuccess && !checkRuntime.isLoading && (
            <Alert severity="success" sx={{ mb: 2 }}>
              Runtime check passed. The notebook kernel and required packages
              are ready.
            </Alert>
          )}
          {checkRuntime.isError && !checkRuntime.isLoading && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {checkRuntime.error instanceof Error
                ? checkRuntime.error.message
                : 'Runtime check failed. Repair the notebook environment and try again.'}
            </Alert>
          )}

          {status.packages.map((pkg) => {
            const versions = packageVersions[pkg.name]?.versions ?? [];
            const latestStable =
              packageVersions[pkg.name]?.latestStable ?? null;
            const isLoadingVersions = loadingVersions[pkg.name] ?? false;
            const canManagePackage = status.state === 'ready';

            return (
              <Accordion
                key={pkg.name}
                expanded={expandedPackage === pkg.name}
                onChange={handlePackageAccordionChange(pkg.name)}
                TransitionProps={{ timeout: 500 }}
                sx={{ mb: 1 }}
              >
                <AccordionSummary expandIcon={<ExpandMore />}>
                  <Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body1" sx={{ fontWeight: 500 }}>
                        {pkg.name}
                      </Typography>
                      {pkg.installedVersion && (
                        <Chip
                          label={`v${pkg.installedVersion}`}
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
                      {pkg.installedVersion
                        ? `Installed ${pkg.installedVersion} · Default ${pkg.requiredVersion}`
                        : `Missing · Default ${pkg.requiredVersion}`}
                    </Typography>
                  </Box>
                </AccordionSummary>
                <AccordionDetails>
                  <Box
                    sx={{
                      mb: 2,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1,
                    }}
                  >
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        fetchPackageVersions(pkg.name).catch(() => undefined);
                      }}
                      disabled={isLoadingVersions}
                      startIcon={
                        isLoadingVersions ? (
                          <CircularProgress size={16} />
                        ) : (
                          <Refresh />
                        )
                      }
                    >
                      {isLoadingVersions ? 'Loading...' : 'Load Versions'}
                    </Button>
                    {pkg.installedVersion && (
                      <Button
                        color="error"
                        variant="outlined"
                        size="small"
                        onClick={() => startPackageUninstall(pkg.name)}
                        disabled={!canManagePackage || isBusy}
                        startIcon={
                          installingPackageKey === `${pkg.name}@uninstall` ? (
                            <CircularProgress size={16} />
                          ) : (
                            <Delete />
                          )
                        }
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
                      {versions.map((versionItem, index) => {
                        const isInstalled =
                          pkg.installedVersion === versionItem.version;
                        const isLatest = versionItem.version === latestStable;
                        let actionLabel = 'Install';
                        if (isInstalled) {
                          actionLabel = 'Installed';
                        } else if (
                          pkg.installedVersion &&
                          compareSimpleVersions(
                            versionItem.version,
                            pkg.installedVersion,
                          ) > 0
                        ) {
                          actionLabel = 'Upgrade';
                        } else if (pkg.installedVersion) {
                          actionLabel = 'Downgrade';
                        }

                        return (
                          <React.Fragment key={versionItem.version}>
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
                                      {versionItem.version}
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
                                    {isLatest && (
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
                                  onClick={() =>
                                    startPackageInstall(
                                      pkg.name,
                                      versionItem.version,
                                    )
                                  }
                                  disabled={
                                    isInstalled || !canManagePackage || isBusy
                                  }
                                  startIcon={
                                    installingPackageKey ===
                                    `${pkg.name}@${versionItem.version}` ? (
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
                  ) : (
                    <Alert severity="info">
                      Click &quot;Load Versions&quot; to view the last 4 stable
                      versions.
                    </Alert>
                  )}
                </AccordionDetails>
              </Accordion>
            );
          })}

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 1,
              mt: 2,
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
              Optional data packages
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                disabled={isBusy || status.state !== 'ready'}
                onClick={startInstallAllCatalogPackages}
                startIcon={<Download />}
              >
                Install all
              </Button>
              <Button
                size="small"
                color="error"
                variant="outlined"
                disabled={isBusy || status.state !== 'ready'}
                onClick={startUninstallAllCatalogPackages}
                startIcon={<Delete />}
              >
                Uninstall all
              </Button>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Install packages as needed. PySpark also needs a separate Java/Spark
            runtime for execution.
          </Typography>
          <List
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}
          >
            {optionalPackages.map(([name, purpose], index) => {
              const installed =
                status.dataPackages.find((item) => item.name === name)
                  ?.installedVersion ??
                status.userPackages.find((item) => item.name === name)
                  ?.installedVersion;
              return (
                <React.Fragment key={name}>
                  <ListItem>
                    <ListItemText
                      primary={name}
                      secondary={`${purpose} · ${installed ? `Installed ${installed}` : 'Not installed'}`}
                    />
                    <ListItemSecondaryAction>
                      <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={isBusy || status.state !== 'ready'}
                          onClick={() => startCatalogInstall(name)}
                          startIcon={<Download />}
                        >
                          {installed ? 'Update' : 'Install'}
                        </Button>
                        {installed && (
                          <Button
                            size="small"
                            color="error"
                            variant="outlined"
                            disabled={isBusy || status.state !== 'ready'}
                            onClick={() => startUserPackageUninstall(name)}
                            startIcon={<Delete />}
                          >
                            Uninstall
                          </Button>
                        )}
                      </Box>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < optionalPackages.length - 1 && <Divider />}
                </React.Fragment>
              );
            })}
          </List>

          {/* Phase 11: arbitrary user packages for the notebook environment */}
          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            Additional packages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Install any PyPI package into the notebook environment. Shell
            commands, paths, editable installs, and version-control URLs are not
            accepted here.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              variant="outlined"
              size="medium"
              label="Package name"
              sx={{ width: 200 }}
              value={userPackageName}
              onChange={(event) => {
                setUserPackageName(event.target.value);
                setUserPackageVersions(null);
              }}
              disabled={isBusy}
            />
            <TextField
              variant="outlined"
              size="medium"
              label="Extras (optional)"
              sx={{ width: 200 }}
              value={userPackageExtras}
              onChange={(event) => setUserPackageExtras(event.target.value)}
              disabled={isBusy}
            />
            <TextField
              variant="outlined"
              size="medium"
              label="Version (optional)"
              sx={{ width: 200 }}
              value={userPackageVersion}
              onChange={(event) => setUserPackageVersion(event.target.value)}
              disabled={isBusy}
            />
          </Box>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <Button
              size="small"
              variant="outlined"
              onClick={lookupUserPackageVersions}
              disabled={!userPackageName.trim() || isBusy}
              startIcon={<Refresh />}
            >
              Check versions
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={startUserPackageInstall}
              disabled={
                !userPackageName.trim() || status.state !== 'ready' || isBusy
              }
              startIcon={<Download />}
            >
              Install package
            </Button>
          </Box>
          {userPackageVersions && userPackageVersions.versions.length > 0 && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
              {userPackageVersions.versions.map((item) => (
                <Chip
                  key={item.version}
                  size="small"
                  label={item.version}
                  clickable
                  color={
                    userPackageVersion.trim() === item.version
                      ? 'primary'
                      : 'default'
                  }
                  onClick={() => setUserPackageVersion(item.version)}
                />
              ))}
            </Box>
          )}
          <Accordion sx={{ mb: 2 }}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              Installed packages ({status.installedPackages.length})
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Includes dependencies. Remove only packages you installed
                through Studio.
              </Typography>
              <Box sx={{ maxHeight: 240, overflow: 'auto' }}>
                {status.installedPackages.map((item) => (
                  <Typography variant="body2" key={item.name}>
                    {item.name} {item.version}
                  </Typography>
                ))}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            {status.state === 'not-installed' && (
              <Button
                variant="contained"
                onClick={() => installRuntime.mutate()}
                disabled={!status.managedPython.available || isBusy}
                startIcon={<CloudDownload />}
              >
                Set up notebook environment
              </Button>
            )}
            {status.state === 'needs-attention' &&
              status.managedPython.available && (
                <Button
                  variant="contained"
                  disabled={isBusy}
                  onClick={() =>
                    confirmOrRunEnvAction(
                      'Repair notebook environment',
                      kernelLossQuestion(
                        'Repair the Studio notebook environment?',
                      ),
                      () => updateRuntime.mutate(status.activeSessionCount),
                    )
                  }
                  startIcon={<Refresh />}
                >
                  Repair notebook environment
                </Button>
              )}
          </Box>

          <ConfirmationModal
            isOpen={Boolean(pendingPackageAction)}
            onClose={() => setPendingPackageAction(null)}
            onConfirm={confirmPackageAction}
            title={
              pendingPackageAction?.kind === 'install'
                ? 'Change Jupyter Package'
                : 'Uninstall Jupyter Package'
            }
            question={confirmQuestion}
          />

          <ConfirmationModal
            isOpen={Boolean(pendingEnvAction)}
            onClose={() => setPendingEnvAction(null)}
            onConfirm={() => {
              pendingEnvAction?.run();
              setPendingEnvAction(null);
            }}
            title={pendingEnvAction?.title ?? 'Confirm'}
            question={pendingEnvAction?.question ?? ''}
          />
        </>
      )}
    </Box>
  );
};
