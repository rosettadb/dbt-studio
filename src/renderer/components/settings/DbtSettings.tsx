/* eslint-disable no-restricted-syntax, no-await-in-loop, no-plusplus */
import React, { useEffect } from 'react';
import {
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
  LinearProgress,
  Backdrop,
  FormControlLabel,
  Checkbox,
  Chip,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import {
  Info,
  Delete,
  GetApp,
  Description,
  CloudDownload,
  Download,
  ExpandMore,
  DataObjectOutlined,
  CodeOutlined,
  BoltOutlined,
  ExtensionOutlined,
  Inventory2Outlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import {
  DbtAdapterCapabilityResponse,
  DbtProjectCompatibilityResult,
  DbtVersionChangePlan,
  DbtVersionListResponse,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListResponse,
  SettingsType,
} from '../../../types/backend';
import {
  useCheckCurrentProjectCompatibility,
  useGetActiveAdapterCapabilities,
  useGetInstalledDbtCore,
  useGetInstalledPackages,
  useInstallDbtVersionChange,
  useInstallLatestPackage,
  useInstallPackageVersion,
  useInstallPython,
  useListDbtCoreVersions,
  useListPackageVersions,
  usePlanDbtVersionChange,
  useUninstallPackage,
} from '../../controllers';
import { ConfirmationModal } from '../modals';
import {
  DBT_ADAPTER_PACKAGES,
  DBT_ADAPTER_PACKAGE_DESCRIPTIONS,
  getPackageInstallSource,
} from '../../../shared/dbtAdapterPackages';
import {
  SettingsRefreshButton,
  SettingsRow,
  SettingsSection,
  SettingsSectionBody,
  SettingsStack,
  SettingsStatus,
} from './SettingsLayout';

interface DbtSettingsProps {
  settings: SettingsType;
  onInstallDbtSave: (key: string, value: string) => Promise<void>;
}

export const DbtSettings: React.FC<DbtSettingsProps> = ({
  settings,
  onInstallDbtSave,
}) => {
  const [isLoadingInstall, setIsLoadingInstall] = React.useState(false);
  const [currentPackage, setCurrentPackage] = React.useState('');
  const [installProgress, setInstallProgress] = React.useState(0);
  const [showInstallAllConfirmation, setShowInstallAllConfirmation] =
    React.useState(false);
  const listDbtCoreVersions = useListDbtCoreVersions();
  const getInstalledDbtCore = useGetInstalledDbtCore();
  const getInstalledPackages = useGetInstalledPackages();
  const installPackageVersion = useInstallPackageVersion();
  const installLatestPackage = useInstallLatestPackage();
  const uninstallPackage = useUninstallPackage();
  const listPackageVersions = useListPackageVersions();
  const planDbtVersionChange = usePlanDbtVersionChange();
  const installDbtVersionChange = useInstallDbtVersionChange();
  const installPython = useInstallPython();
  const checkCurrentProjectCompatibility =
    useCheckCurrentProjectCompatibility();
  const getActiveAdapterCapabilities = useGetActiveAdapterCapabilities();

  const [isLoadingDialog, setIsLoadingDialog] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState('');
  const [installingPackageKey, setInstallingPackageKey] = React.useState<
    string | null
  >(null);

  const [selectedPackages, setSelectedPackages] = React.useState<
    Record<string, boolean>
  >({
    'dbt-core': true,
    ...Object.fromEntries(DBT_ADAPTER_PACKAGES.map((pkg) => [pkg, true])),
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
  const [adapterCapabilities, setAdapterCapabilities] =
    React.useState<DbtAdapterCapabilityResponse | null>(null);

  const [packageVersions, setPackageVersions] = React.useState<
    Record<string, PythonPackageVersionListResponse | null>
  >({});
  const [isCheckingPackageVersions, setIsCheckingPackageVersions] =
    React.useState<Record<string, boolean>>({});
  const [expandedPackage, setExpandedPackage] = React.useState<string | false>(
    false,
  );

  const packageDescriptions: Record<string, string> = {
    'dbt-core': 'The core dbt™ package (required)',
    ...DBT_ADAPTER_PACKAGE_DESCRIPTIONS,
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
      [packageName]: !prev[packageName],
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
    const allPackages = ['dbt-core', ...DBT_ADAPTER_PACKAGES, 'sqlglot'];

    const packages = allPackages.filter((pkg) => selectedPackages[pkg]);

    setIsLoadingInstall(true);
    setInstallProgress(0);
    setIsLoadingDialog(true);
    setVersionChangeResult(null);

    try {
      let { pythonPath } = settings;
      if (!pythonPath) {
        toast.info(
          'Python is required for dbt Core v1 and will be installed automatically.',
        );
        setLoadingMessage('Installing Python...');
        const pythonResult = await installPython.mutateAsync();
        if (!pythonResult.success) {
          throw new Error(`Failed to install Python: ${pythonResult.error}`);
        }
        pythonPath = pythonResult.path;
        await onInstallDbtSave('pythonPath', pythonResult.path);
        await onInstallDbtSave('pythonVersion', pythonResult.version);
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
            pythonPath,
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
            pythonPath,
            packageName: pkg,
          });
          if (!result.ok) {
            const error = result.error || `Unable to install ${pkg}.`;
            setVersionChangeResult((previous) => ({
              ok: false,
              error:
                previous && !previous.ok
                  ? [previous.error, error].filter(Boolean).join('\n')
                  : error,
            }));
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

  const ensurePythonForVersion = async (version: string): Promise<boolean> => {
    const isPythonRuntime = Number.parseInt(version, 10) === 1;
    if (!isPythonRuntime || settings.pythonPath) return true;

    toast.info(
      'Python is required for dbt Core v1 and will be installed automatically.',
    );
    setIsLoadingDialog(true);
    setLoadingMessage('Installing Python...');
    try {
      const result = await installPython.mutateAsync();
      if (!result.success) {
        setVersionChangeResult({
          ok: false,
          error: `Failed to install Python: ${result.error}`,
        });
        return false;
      }
      await onInstallDbtSave('pythonPath', result.path);
      await onInstallDbtSave('pythonVersion', result.version);
      return true;
    } catch (error) {
      setVersionChangeResult({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Failed to install Python.',
      });
      return false;
    } finally {
      setIsLoadingDialog(false);
      setLoadingMessage('');
    }
  };

  const prepareDbtVersionChange = async (version: string) => {
    const pythonReady = await ensurePythonForVersion(version);
    if (!pythonReady) return;

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

  const ADAPTER_PACKAGES = DBT_ADAPTER_PACKAGES;

  const handleInstallAllAdapters = async () => {
    if (!settings.pythonPath) {
      toast.info('dbt Core must be installed before installing adapters.');
      return;
    }

    const toInstall = ADAPTER_PACKAGES.filter((pkg) => !installedPackages[pkg]);
    if (toInstall.length === 0) {
      toast.info('All adapters are already installed.');
      return;
    }

    setIsLoadingInstall(true);
    setIsLoadingDialog(true);
    setVersionChangeResult(null);

    const errors: string[] = [];

    for (let i = 0; i < toInstall.length; i += 1) {
      const pkg = toInstall[i];
      setCurrentPackage(pkg);
      setLoadingMessage(`Installing ${pkg} (${i + 1}/${toInstall.length})...`);
      setInstallProgress((i / toInstall.length) * 100);

      // eslint-disable-next-line no-await-in-loop
      const result = await installLatestPackage({
        pythonPath: settings.pythonPath,
        packageName: pkg,
      });

      if (result.ok && result.installedVersion) {
        setInstalledPackages((prev) => ({
          ...prev,
          [pkg]: result.installedVersion as string,
        }));
      } else if (!result.ok) {
        errors.push(`${pkg}: ${result.error || 'unknown error'}`);
      }
    }

    setInstallProgress(100);

    if (errors.length > 0) {
      setVersionChangeResult({
        ok: false,
        error: errors.join('\n'),
      });
    } else {
      toast.success(
        `All ${toInstall.length} adapter(s) installed successfully.`,
      );
    }

    setIsLoadingInstall(false);
    setCurrentPackage('');
    setIsLoadingDialog(false);
    setLoadingMessage('');
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

  useEffect(() => {
    getActiveAdapterCapabilities()
      .then(setAdapterCapabilities)
      .catch(() => setAdapterCapabilities(null));
  }, [getActiveAdapterCapabilities, settings.dbtVersion]);

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
      return <SettingsRow label={emptyMessage} />;
    }

    return versions.map((item) => {
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
        <SettingsRow
          key={item.version}
          label={
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 0.75,
                flexWrap: 'wrap',
              }}
            >
              {item.version}
              {isLatest && !item.isPrerelease && (
                <Chip label="Latest stable" size="small" variant="outlined" />
              )}
              {item.isPrerelease && (
                <Chip
                  label="Preview"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              )}
            </Box>
          }
        >
          {isInstalled ? (
            <SettingsStatus tone="success">Installed</SettingsStatus>
          ) : (
            <Button
              size="small"
              onClick={() => {
                prepareDbtVersionChange(item.version).catch(() => undefined);
              }}
              disabled={isLoadingDialog || isLoadingInstall}
              startIcon={
                installingPackageKey === `dbt-core@${item.version}` ? (
                  <CircularProgress size={14} />
                ) : undefined
              }
            >
              {actionLabel}
            </Button>
          )}
        </SettingsRow>
      );
    });
  };

  const hasDbt = Boolean(settings.dbtPath && settings.dbtPath !== 'dbt');
  const isV2Active = Boolean(settings.dbtVersion?.startsWith('2.'));

  return (
    <SettingsStack>
      <SettingsSection
        title="dbt Core"
        icon={<DataObjectOutlined />}
        description="Changing the active dbt runtime affects all local projects."
      >
        <SettingsRow
          label="dbt Path"
          description={settings.dbtPath || 'Not installed'}
        >
          {hasDbt && (
            <SettingsStatus tone="success">
              {isV2Active ? 'v2 (Rust)' : 'v1 (Python)'}
              {settings.dbtVersion ? ` · ${settings.dbtVersion}` : ''}
            </SettingsStatus>
          )}
        </SettingsRow>
        {settings.pythonPath && settings.pythonVersion && (
          <SettingsRow
            label="Python environment"
            description={settings.pythonPath}
          >
            <Chip size="small" label={settings.pythonVersion} />
          </SettingsRow>
        )}
        {hasDbt && isV2Active && (
          <SettingsSectionBody>
            <Alert severity="warning">
              dbt Core v2 is still in alpha — cloud pipeline runs and other
              cloud features are unavailable until the first official v2
              release.
            </Alert>
          </SettingsSectionBody>
        )}
      </SettingsSection>

      {versionChangeResult && (
        <Alert severity={versionChangeResult.ok ? 'success' : 'error'}>
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
        <Alert severity={compatibilityResult.ok ? 'success' : 'warning'}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {compatibilityResult.ok
              ? `Project ${compatibilityResult.projectName} passed dbt parse and compile.`
              : `Project ${compatibilityResult.projectName || ''} has migration diagnostics.`}
          </Typography>
          {compatibilityResult.error && (
            <Typography variant="body2">{compatibilityResult.error}</Typography>
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

      <SettingsSection
        title="dbt Core v1 · Python"
        icon={<CodeOutlined />}
        description="Stable runtime. Recommended for production projects and broad adapter compatibility."
        action={
          <>
            <Button
              size="small"
              onClick={() => setShowOlderVersions((value) => !value)}
            >
              {showOlderVersions ? 'Show fewer' : 'Show older'}
            </Button>
            <SettingsRefreshButton
              title="Refresh versions"
              onClick={handleRefreshDbtCoreVersionsClick}
              loading={isCheckingDbtCoreVersions}
            />
          </>
        }
      >
        {!settings.pythonPath && (
          <SettingsSectionBody>
            <Alert severity="info">
              Python is not installed yet. Installing a dbt Core v1 version
              below will install it automatically.
            </Alert>
          </SettingsSectionBody>
        )}
        {renderVersionList(
          pythonDbtVersions,
          'No dbt Core v1 releases are available.',
        )}
      </SettingsSection>

      <SettingsSection
        title="dbt Core v2 · Rust"
        icon={<BoltOutlined />}
        description="Preview runtime, still in alpha. Cloud pipeline runs are unavailable while v2 is active."
        action={
          <Chip
            label="Preview"
            size="small"
            color="warning"
            variant="outlined"
          />
        }
      >
        {renderVersionList(
          rustDbtVersions,
          'No dbt Core v2 preview releases are available.',
        )}
      </SettingsSection>

      <SettingsSection
        title={
          isV2Active ? 'Project adapter compatibility' : 'Adapter packages'
        }
        icon={<ExtensionOutlined />}
        description={
          isV2Active
            ? 'dbt Core v2 includes its own adapter runtime. Python adapter packages are used only by dbt Core v1.'
            : undefined
        }
        action={
          !isV2Active &&
          hasDbt && (
            <Button
              size="small"
              variant="outlined"
              onClick={() => setShowInstallAllConfirmation(true)}
              disabled={isLoadingInstall || isLoadingDialog}
              startIcon={
                isLoadingInstall ? (
                  <CircularProgress size={14} color="inherit" />
                ) : (
                  <CloudDownload />
                )
              }
            >
              {isLoadingInstall ? 'Installing...' : 'Install All Adapters'}
            </Button>
          )
        }
      >
        {isV2Active &&
          adapterCapabilities?.adapters.map((adapter) => (
            <SettingsRow
              key={adapter.adapter || 'unknown'}
              label={
                <Box
                  sx={{
                    display: 'flex',
                    gap: 1,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                  }}
                >
                  {adapter.displayName}
                  <SettingsStatus
                    tone={adapter.canExecute ? 'warning' : 'error'}
                  >
                    {adapter.status}
                  </SettingsStatus>
                  <Chip
                    size="small"
                    variant="outlined"
                    label={adapter.driver}
                  />
                </Box>
              }
              description={adapter.notes}
            />
          ))}
        {isV2Active && !adapterCapabilities && (
          <SettingsRow label="Adapter compatibility is not available yet." />
        )}

        {!isV2Active &&
          ADAPTER_PACKAGES.map((pkg) => {
            const installed = installedPackages[pkg];
            const versions = packageVersions[pkg]?.versions ?? [];
            const latestStable = packageVersions[pkg]?.latestStable ?? null;
            const isLoading = isCheckingPackageVersions[pkg] ?? false;
            const installSource = getPackageInstallSource(pkg);
            const isExpanded = expandedPackage === pkg;

            return (
              <Box key={pkg}>
                <SettingsRow
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {pkg}
                      {installed && (
                        <Chip
                          label={`v${installed}`}
                          size="small"
                          variant="outlined"
                        />
                      )}
                    </Box>
                  }
                  description={packageDescriptions[pkg]}
                >
                  {installSource ? (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        handleInstallSinglePackage(pkg).catch(() => undefined);
                      }}
                      disabled={isLoadingInstall || isLoadingDialog}
                      startIcon={<Download />}
                    >
                      {installed ? 'Update from source' : 'Install'}
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      onClick={() => {
                        fetchPackageVersions(pkg).catch(() => undefined);
                        if (!isExpanded) {
                          setExpandedPackage(pkg);
                        }
                      }}
                      disabled={isLoading}
                      startIcon={
                        isLoading ? <CircularProgress size={14} /> : undefined
                      }
                    >
                      {isLoading ? 'Loading...' : 'Versions'}
                    </Button>
                  )}
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
                  <IconButton
                    size="small"
                    onClick={(event) =>
                      handlePackageAccordionChange(pkg)(event, !isExpanded)
                    }
                    aria-label={isExpanded ? 'Hide details' : 'Show details'}
                  >
                    <ExpandMore
                      fontSize="small"
                      sx={{
                        transform: isExpanded ? 'rotate(180deg)' : 'none',
                        transition: 'transform 0.15s',
                      }}
                    />
                  </IconButton>
                </SettingsRow>

                {isExpanded && (
                  <SettingsSectionBody>
                    {installSource && (
                      <Alert severity="info">
                        {pkg} is not published on PyPI. It is installed directly
                        from {installSource.homepage} and requires dbt Core 1.8
                        or newer (1.x).
                      </Alert>
                    )}

                    {!installSource && versions.length > 0 && (
                      <Box
                        sx={(theme) => ({
                          border: `1px solid ${theme.palette.divider}`,
                          borderRadius: 1,
                          '& > * + *': {
                            borderTop: `1px solid ${theme.palette.divider}`,
                          },
                        })}
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
                            <SettingsRow
                              key={v.version}
                              label={
                                <Box
                                  sx={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 1,
                                  }}
                                >
                                  {v.version}
                                  {isLatest && !v.isPrerelease && (
                                    <Chip
                                      label="Latest"
                                      size="small"
                                      variant="outlined"
                                    />
                                  )}
                                </Box>
                              }
                            >
                              {isInstalled ? (
                                <SettingsStatus tone="success">
                                  Installed
                                </SettingsStatus>
                              ) : (
                                <Button
                                  size="small"
                                  onClick={() => {
                                    installSinglePackageVersion(
                                      pkg,
                                      v.version,
                                    ).catch(() => undefined);
                                  }}
                                  disabled={isLoadingDialog || isLoadingInstall}
                                  startIcon={
                                    installingPackageKey ===
                                    `${pkg}@${v.version}` ? (
                                      <CircularProgress size={14} />
                                    ) : undefined
                                  }
                                >
                                  {actionLabel}
                                </Button>
                              )}
                            </SettingsRow>
                          );
                        })}
                      </Box>
                    )}

                    {!installSource && versions.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {isLoading
                          ? 'Loading versions...'
                          : 'Click "Versions" to view versions.'}
                      </Typography>
                    )}
                  </SettingsSectionBody>
                )}
              </Box>
            );
          })}
      </SettingsSection>

      {hasDbt ? (
        <SettingsSection
          title="Installed Packages"
          icon={<Inventory2Outlined />}
          action={
            <SettingsRefreshButton
              title="Refresh packages"
              onClick={handleRefreshInstalledPackagesClick}
              loading={isCheckingPackages}
            />
          }
        >
          {Object.keys(installedPackages).length > 0
            ? Object.entries(packageDescriptions)
                .filter(([pkg]) => pkg === 'sqlglot')
                .map(([pkg, description]) => {
                  const version = installedPackages[pkg];
                  const isInstalled = !!version;

                  return (
                    <SettingsRow
                      key={pkg}
                      label={`${pkg} ${
                        isInstalled ? `v${version}` : '(not installed)'
                      }`}
                      description={description}
                    >
                      {isInstalled ? (
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
                          variant="outlined"
                          size="small"
                          onClick={() => handleInstallSinglePackage(pkg)}
                          disabled={isLoadingInstall}
                          startIcon={<GetApp />}
                        >
                          Install
                        </Button>
                      )}
                    </SettingsRow>
                  );
                })
            : !isCheckingPackages && (
                <SettingsRow
                  label="No dbt packages found."
                  description="You may need to reinstall dbt."
                />
              )}
        </SettingsSection>
      ) : (
        <SettingsSection
          title="dbt™ Core Setup Required"
          icon={<Info />}
          description="Set up dbt™ Core and the necessary adapters on your system."
          action={
            <Button
              size="small"
              onClick={() => {
                window.open(
                  'https://docs.getdbt.com/docs/core/installation',
                  '_blank',
                );
              }}
              color="primary"
              startIcon={<Description />}
            >
              Documentation
            </Button>
          }
        >
          {Object.entries(packageDescriptions).map(([pkg, description]) => (
            <SettingsRow key={pkg} label={pkg} description={description}>
              <Checkbox
                size="small"
                checked={selectedPackages[pkg] ?? false}
                onChange={() => handlePackageToggle(pkg)}
                disabled={pkg === 'dbt-core'} // dbt-core is always required
              />
            </SettingsRow>
          ))}

          {isLoadingInstall && (
            <SettingsSectionBody>
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
            </SettingsSectionBody>
          )}

          <SettingsRow label="Install">
            <Button
              size="small"
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
          </SettingsRow>
        </SettingsSection>
      )}

      <ConfirmationModal
        isOpen={showInstallAllConfirmation}
        onClose={() => setShowInstallAllConfirmation(false)}
        onConfirm={() => {
          setShowInstallAllConfirmation(false);
          handleInstallAllAdapters().catch(() => undefined);
        }}
        title="Install All Adapters"
        question="This will install the latest version of all dbt adapter packages (postgres, snowflake, bigquery, redshift, databricks, duckdb). Already-installed adapters will be skipped. Continue?"
      />

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
    </SettingsStack>
  );
};
