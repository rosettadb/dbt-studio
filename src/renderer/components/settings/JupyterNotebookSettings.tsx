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
  Add,
  ContentCopy,
  Computer,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  useCheckPythonNotebookRuntime,
  useInstallPythonNotebookPackage,
  useInstallPythonNotebookRuntime,
  useListPythonNotebookPackageVersions,
  useUninstallPythonNotebookPackage,
  usePythonNotebookRuntimeStatus,
  useSelectPythonNotebookEnvironment,
  useAddCustomPythonInterpreter,
  useRemovePythonNotebookEnvironment,
  useInstallPythonDataProfile,
  useEnsurePythonKernelSupport,
  useInstallPythonUserPackage,
  useUninstallPythonUserPackage,
  useListPythonUserPackageVersions,
  useGetSelectedProject,
} from '../../controllers';
import { ConfirmationModal } from '../modals';
import {
  PythonNotebookEnvironmentStatus,
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
  // Phase 11: environment selection and user package management.
  const [customInterpreterPath, setCustomInterpreterPath] = React.useState('');
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
  const { data: selectedProject } = useGetSelectedProject();
  const projectPath = selectedProject?.path ?? undefined;
  const {
    data: status,
    isLoading,
    isError,
  } = usePythonNotebookRuntimeStatus(projectPath);
  const installRuntime = useInstallPythonNotebookRuntime();
  const checkRuntime = useCheckPythonNotebookRuntime();
  const listPackageVersions = useListPythonNotebookPackageVersions();
  const installPackage = useInstallPythonNotebookPackage();
  const uninstallPackage = useUninstallPythonNotebookPackage();
  const selectEnvironment = useSelectPythonNotebookEnvironment();
  const addCustomInterpreter = useAddCustomPythonInterpreter();
  const removeEnvironment = useRemovePythonNotebookEnvironment();
  const installDataProfile = useInstallPythonDataProfile();
  const ensureKernelSupport = useEnsurePythonKernelSupport();
  const installUserPackage = useInstallPythonUserPackage();
  const uninstallUserPackage = useUninstallPythonUserPackage();
  const listUserPackageVersions = useListPythonUserPackageVersions();
  const operationActive = Boolean(status && status.operation.state !== 'idle');
  const isBusy = Boolean(
    operationActive ||
      installRuntime.isLoading ||
      installPackage.isLoading ||
      uninstallPackage.isLoading ||
      checkRuntime.isLoading ||
      selectEnvironment.isLoading ||
      addCustomInterpreter.isLoading ||
      removeEnvironment.isLoading ||
      installDataProfile.isLoading ||
      ensureKernelSupport.isLoading ||
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

  const runSelectEnvironment = async (environmentId: string): Promise<void> => {
    try {
      await selectEnvironment.mutateAsync({
        environmentId,
        expectedActiveSessionCount: status?.activeSessionCount ?? 0,
        projectPath,
      });
      toast.success('Notebook environment selected');
    } catch (error) {
      notifyError(error, 'Failed to select environment.');
    }
  };

  const runAddCustomInterpreter = async (): Promise<void> => {
    const interpreterPath = customInterpreterPath.trim();
    if (!interpreterPath) {
      toast.error('Enter the full path to a Python executable.');
      return;
    }
    try {
      await addCustomInterpreter.mutateAsync({ path: interpreterPath });
      toast.success('Custom interpreter added. Select it to use it.');
      setCustomInterpreterPath('');
    } catch (error) {
      notifyError(error, 'Failed to add interpreter.');
    }
  };

  const runRemoveEnvironment = async (
    environment: PythonNotebookEnvironmentStatus,
  ): Promise<void> => {
    try {
      await removeEnvironment.mutateAsync({ environmentId: environment.id });
      toast.success('Custom interpreter removed');
    } catch (error) {
      notifyError(error, 'Failed to remove interpreter.');
    }
  };

  const startDataProfileInstall = () => {
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    confirmOrRunEnvAction(
      'Install data packages',
      kernelLossQuestion(
        'Install numpy, pandas, matplotlib, polars, pyarrow, and pyspark into the selected environment?',
      ),
      async () => {
        try {
          await installDataProfile.mutateAsync(expectedActiveSessionCount);
          toast.success('Data packages installed');
        } catch (error) {
          notifyError(error, 'Failed to install data packages.');
        }
      },
    );
  };

  const startEnsureKernelSupport = () => {
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    confirmOrRunEnvAction(
      'Install kernel support',
      kernelLossQuestion(
        'Install ipykernel support into the selected environment?',
      ),
      async () => {
        try {
          await ensureKernelSupport.mutateAsync(expectedActiveSessionCount);
          toast.success('Kernel support installed');
        } catch (error) {
          notifyError(error, 'Failed to install kernel support.');
        }
      },
    );
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
      kernelLossQuestion(`Install ${spec} into the selected environment?`),
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

  const startUserPackageUninstall = (packageName: string) => {
    const expectedActiveSessionCount = status?.activeSessionCount ?? 0;
    confirmOrRunEnvAction(
      'Uninstall Python package',
      kernelLossQuestion(
        `Uninstall ${packageName} from the selected environment?`,
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

  const copyRequirementsSnippet = async (): Promise<void> => {
    if (!status) return;
    try {
      await navigator.clipboard.writeText(status.requirementsSnippet);
      toast.success('Install command copied');
    } catch {
      toast.error('Failed to copy install command');
    }
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

          {/* Phase 11: IDE-style environment selection */}
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mt: 1 }}>
            Python environment
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Notebook kernels run with the selected environment, like choosing an
            interpreter in PyCharm or VS Code. Shut down all kernels before
            switching environments.
          </Typography>
          <List
            sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 1 }}
          >
            {status.environments.map((env, index) => (
              <React.Fragment key={env.id}>
                <ListItem>
                  <ListItemText
                    primary={
                      <Box
                        sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                      >
                        <Computer fontSize="small" color="action" />
                        <Typography variant="body1" sx={{ fontWeight: 500 }}>
                          {env.label}
                        </Typography>
                        {env.isSelected && (
                          <Chip label="Selected" size="small" color="success" />
                        )}
                        {env.kernelReady === true && (
                          <Chip label="Kernel ready" size="small" />
                        )}
                        {env.kernelReady === false && env.isSelected && (
                          <Chip
                            label="Missing kernel support"
                            size="small"
                            color="warning"
                          />
                        )}
                        {!env.exists && (
                          <Chip
                            label="Unavailable"
                            size="small"
                            color="warning"
                          />
                        )}
                        {!env.writable && env.exists && (
                          <Chip label="Read-only" size="small" />
                        )}
                      </Box>
                    }
                    secondaryTypographyProps={{ component: 'div' }}
                    secondary={
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          {env.kind === 'managed' &&
                            'Studio managed environment'}
                          {env.kind === 'base' &&
                            'Managed Python base interpreter'}
                          {env.kind === 'project' && 'Project-local virtualenv'}
                          {env.kind === 'custom' && 'Custom interpreter'}
                          {env.pythonVersion
                            ? ` · Python ${env.pythonVersion}`
                            : ''}
                        </Typography>
                        {env.pythonPath && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{
                              wordBreak: 'break-all',
                              fontFamily: 'monospace',
                            }}
                          >
                            {env.pythonPath}
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                  <ListItemSecondaryAction>
                    {!env.isSelected && env.exists && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => runSelectEnvironment(env.id)}
                        disabled={isBusy}
                        sx={{ mr: 1 }}
                      >
                        Use
                      </Button>
                    )}
                    {env.kind === 'custom' && (
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => runRemoveEnvironment(env)}
                        disabled={isBusy}
                      >
                        Remove
                      </Button>
                    )}
                  </ListItemSecondaryAction>
                </ListItem>
                {index < status.environments.length - 1 && <Divider />}
              </React.Fragment>
            ))}
          </List>
          <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
            <TextField
              size="small"
              fullWidth
              label="Custom interpreter path"
              placeholder="/usr/local/bin/python3"
              value={customInterpreterPath}
              onChange={(event) => setCustomInterpreterPath(event.target.value)}
              disabled={isBusy}
            />
            <Button
              variant="outlined"
              onClick={runAddCustomInterpreter}
              disabled={!customInterpreterPath.trim() || isBusy}
              startIcon={<Add />}
              sx={{ whiteSpace: 'nowrap' }}
            >
              Add
            </Button>
          </Box>

          {status.selectedEnvironment && !status.kernelReady && (
            <Alert
              severity="warning"
              sx={{ mb: 2 }}
              action={
                status.selectedEnvironment.writable ? (
                  <Button
                    size="small"
                    onClick={startEnsureKernelSupport}
                    disabled={isBusy}
                  >
                    Install kernel support
                  </Button>
                ) : undefined
              }
            >
              {status.selectedEnvironment.writable
                ? `"${status.selectedEnvironment.label}" cannot run notebooks yet (missing ipykernel).`
                : `"${status.selectedEnvironment.label}" is read-only and cannot run notebooks yet. Install ipykernel manually, then check the runtime again.`}
            </Alert>
          )}

          {status.selectedEnvironment?.kind !== 'managed' && (
            <Alert severity="info" sx={{ mb: 1 }}>
              Required Jupyter package versions below are managed in the Studio
              managed environment. Switch environments to change them.
            </Alert>
          )}

          {status.packages.map((pkg) => {
            const versions = packageVersions[pkg.name]?.versions ?? [];
            const latestStable =
              packageVersions[pkg.name]?.latestStable ?? null;
            const isLoadingVersions = loadingVersions[pkg.name] ?? false;
            const canManagePackage =
              status.state !== 'not-installed' &&
              status.selectedEnvironment?.kind === 'managed';

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

          {/* Phase 11: curated data packages for the selected environment */}
          <Typography variant="subtitle1" sx={{ fontWeight: 500, mt: 2 }}>
            Data packages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Quick-install numpy, pandas, matplotlib, polars, pyarrow, and
            pyspark into the selected environment. For pyspark, Java/Spark
            runtime availability is separate from package installation.
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 1 }}>
            {status.dataPackages.map((pkg) => (
              <Chip
                key={pkg.name}
                size="small"
                label={
                  pkg.installedVersion
                    ? `${pkg.name} ${pkg.installedVersion}`
                    : `${pkg.name} missing`
                }
                color={pkg.installedVersion ? 'success' : 'default'}
              />
            ))}
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={startDataProfileInstall}
            disabled={!status.selectedEnvironment?.writable || isBusy}
            startIcon={<Download />}
            sx={{ mb: 2 }}
          >
            Install data packages
          </Button>

          {/* Phase 11: arbitrary user packages for the selected environment */}
          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            Additional packages
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            Install any PyPI package into the selected environment. Shell
            commands, paths, editable installs, and version-control URLs are not
            accepted here.
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, mb: 1, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Package name"
              placeholder="seaborn"
              value={userPackageName}
              onChange={(event) => {
                setUserPackageName(event.target.value);
                setUserPackageVersions(null);
              }}
              disabled={isBusy}
            />
            <TextField
              size="small"
              label="Extras (optional)"
              placeholder="perf,test"
              value={userPackageExtras}
              onChange={(event) => setUserPackageExtras(event.target.value)}
              disabled={isBusy}
            />
            <TextField
              size="small"
              label="Version (optional)"
              placeholder="3.1.0"
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
            >
              Check versions
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={startUserPackageInstall}
              disabled={
                !userPackageName.trim() ||
                !status.selectedEnvironment?.writable ||
                isBusy
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
          {status.userPackages.length > 0 && (
            <List
              sx={{ border: 1, borderColor: 'divider', borderRadius: 1, mb: 2 }}
            >
              {status.userPackages.map((pkg, index) => (
                <React.Fragment key={`${pkg.name}-${index}`}>
                  <ListItem>
                    <ListItemText
                      primary={pkg.name}
                      secondary={
                        pkg.installedVersion
                          ? `Installed ${pkg.installedVersion}${pkg.requestedVersion ? ` · Requested ${pkg.requestedVersion}` : ''}${pkg.extras.length > 0 ? ` · Extras ${pkg.extras.join(', ')}` : ''}`
                          : 'Not installed'
                      }
                    />
                    <ListItemSecondaryAction>
                      <Button
                        size="small"
                        color="error"
                        variant="outlined"
                        onClick={() => startUserPackageUninstall(pkg.name)}
                        disabled={isBusy}
                      >
                        Uninstall
                      </Button>
                    </ListItemSecondaryAction>
                  </ListItem>
                  {index < status.userPackages.length - 1 && <Divider />}
                </React.Fragment>
              ))}
            </List>
          )}

          <Typography variant="subtitle1" sx={{ fontWeight: 500 }}>
            Reproducibility
          </Typography>
          <Box
            component="pre"
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 1,
              p: 1,
              fontSize: '0.75rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              mb: 1,
            }}
          >
            {status.requirementsSnippet}
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={copyRequirementsSnippet}
            startIcon={<ContentCopy />}
            sx={{ mb: 1 }}
          >
            Copy install command
          </Button>

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
