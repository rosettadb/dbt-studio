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
import {
  useCheckPythonNotebookRuntime,
  useInstallPythonNotebookPackage,
  useInstallPythonNotebookRuntime,
  useListPythonNotebookPackageVersions,
  useUninstallPythonNotebookPackage,
  usePythonNotebookRuntimeStatus,
} from '../../controllers';
import { ConfirmationModal } from '../modals';
import {
  PythonNotebookPackageStatus,
  PythonNotebookPackageVersionListResponse,
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

export const JupyterNotebookSettings: React.FC = () => {
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
  const { data: status, isLoading, isError } = usePythonNotebookRuntimeStatus();
  const installRuntime = useInstallPythonNotebookRuntime();
  const checkRuntime = useCheckPythonNotebookRuntime();
  const listPackageVersions = useListPythonNotebookPackageVersions();
  const installPackage = useInstallPythonNotebookPackage();
  const uninstallPackage = useUninstallPythonNotebookPackage();
  const operationActive = Boolean(status && status.operation.state !== 'idle');
  const isBusy = Boolean(
    operationActive ||
      installRuntime.isLoading ||
      installPackage.isLoading ||
      uninstallPackage.isLoading ||
      checkRuntime.isLoading,
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

  return (
    <Box sx={{ pt: 3, mt: 3, borderTop: 1, borderColor: 'divider' }}>
      <Backdrop
        open={isBusy}
        sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, color: '#fff' }}
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
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              Active Python kernels: {status.activeSessionCount}
            </Typography>
            {status.message && (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {status.message}
              </Typography>
            )}
          </Alert>

          {status.packages.map((pkg) => {
            const versions = packageVersions[pkg.name]?.versions ?? [];
            const latestStable =
              packageVersions[pkg.name]?.latestStable ?? null;
            const isLoadingVersions = loadingVersions[pkg.name] ?? false;
            const canManagePackage = status.state !== 'not-installed';

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

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block' }}
          >
            Environment location: {status.environmentPath}
          </Typography>

          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            {status.state === 'not-installed' && (
              <Button
                variant="contained"
                onClick={() => installRuntime.mutate()}
                disabled={!status.managedPython.available || isBusy}
                startIcon={
                  installRuntime.isLoading ? (
                    <CircularProgress size={16} />
                  ) : (
                    <CloudDownload />
                  )
                }
              >
                Install Jupyter Packages
              </Button>
            )}
            <Button
              variant="outlined"
              onClick={() => checkRuntime.mutate()}
              disabled={status.state !== 'ready' || isBusy}
              startIcon={
                checkRuntime.isLoading ? (
                  <CircularProgress size={16} />
                ) : (
                  <Refresh />
                )
              }
            >
              Check Runtime
            </Button>
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
        </>
      )}
    </Box>
  );
};
