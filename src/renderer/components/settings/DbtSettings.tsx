/* eslint-disable no-restricted-syntax, no-await-in-loop, no-plusplus */
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  AlertTitle,
  ToggleButton,
  ToggleButtonGroup,
  TextField,
  MenuItem,
  Tooltip,
} from '@mui/material';
import {
  Info,
  Delete,
  GetApp,
  Description,
  CloudDownload,
  Download,
  ExpandMore,
  ExtensionOutlined,
  Inventory2Outlined,
  Close,
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
import type { TaskRecord } from '../../../types/ipc';
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
  useSettingsWarningStyle,
} from './SettingsLayout';
import { DbtMonoIcon } from '../icon/DbtMonoIcon';
import { useActiveInstallTasks } from '../../hooks';
import { useTaskManager } from '../../context';
import {
  isDbtRuntimeSubject,
  isDbtV2SwitchSubject,
  isInstallCancelledError,
  isSubjectForPackage,
} from '../../../shared/installTasks';

const CANCEL_QUEUED_TOOLTIP =
  'Remove from the queue. Nothing has been installed yet, so nothing needs cleaning up.';

// Next to an install that is still waiting in the queue.
const CancelQueuedButton: React.FC<{ onCancel: () => void }> = ({
  onCancel,
}) => (
  <Tooltip title={CANCEL_QUEUED_TOOLTIP}>
    <IconButton
      size="small"
      aria-label="Remove from the queue"
      onClick={onCancel}
    >
      <Close fontSize="small" />
    </IconButton>
  </Tooltip>
);

// What a queued or running install on this page is about, as used in its
// tooltip: "dbt-snowflake 1.12.8", "the latest dbt-snowflake", "the switch to
// dbt Core 1.11.11". Installs from other pages fall back to their label.
const describeInstallSubject = (task: TaskRecord): string => {
  if (task.type !== 'install:dbt' || !task.subject) return `"${task.label}"`;
  const [packageName, version] = task.subject.split('@');
  if (isDbtRuntimeSubject(task.subject) && version) {
    return `the switch to dbt Core ${version}`;
  }
  if (version) return `${packageName} ${version}`;
  return task.label.startsWith('Uninstalling')
    ? `uninstalling ${packageName}`
    : `the latest ${packageName}`;
};

const describeRunningInstall = (task: TaskRecord): string => {
  const [packageName, version] = (task.subject ?? '').split('@');
  if (isDbtRuntimeSubject(task.subject) && version) {
    return `Switching to dbt Core ${version} now.`;
  }
  if (task.label.startsWith('Uninstalling')) {
    return `Uninstalling ${packageName} now.`;
  }
  return version
    ? `Installing ${packageName} ${version} now.`
    : `Installing the latest ${packageName} now.`;
};

const startSentence = (text: string) =>
  text.startsWith('dbt-') ? text : text.charAt(0).toUpperCase() + text.slice(1);

// Tooltip lines for a queued or running install. `activeInstallTasks` is the
// whole studio queue, since installs from every page wait in the same line.
const getInstallTaskTooltipLines = (
  task: TaskRecord,
  activeInstallTasks: TaskRecord[],
): string[] => {
  const lines: string[] = [];
  if (task.status === 'running') {
    lines.push(
      describeRunningInstall(task),
      task.cancellable
        ? 'You can still stop it from the Task Manager.'
        : "It can't be stopped safely now.",
    );
  } else {
    const subject = startSentence(describeInstallSubject(task));
    const running = activeInstallTasks.find(
      (other) => other.status === 'running',
    );
    const waitingAhead = activeInstallTasks.filter(
      (other) => other.status === 'pending' && other.startedAt < task.startedAt,
    ).length;
    if (!running) {
      lines.push(`${subject} is next.`);
    } else if (waitingAhead === 0) {
      lines.push(
        `${subject} is next. It starts when ${describeInstallSubject(running)} finishes.`,
      );
    } else {
      lines.push(
        `${subject} will start after ${waitingAhead + 1} other installs finish. Now running: ${describeInstallSubject(running)}.`,
      );
    }
  }
  lines.push('Click to see the full queue in the Task Manager.');
  return lines;
};

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
  // Installs wait in the task manager's queue. Each task's subject says what
  // it installs, so this page shows "Queued" on what was clicked even after
  // it is closed and opened again.
  const { cancel: cancelTask } = useTaskManager();
  const activeInstallTasks = useActiveInstallTasks();
  const navigate = useNavigate();
  // Tooltip on a queued or running install. Disabled buttons get no mouse
  // events, so a wrapper shows the tooltip and opens the Task Manager on click.
  const withInstallTaskTooltip = (
    task: TaskRecord | undefined,
    element: React.ReactElement,
  ) =>
    task ? (
      <Tooltip
        title={getInstallTaskTooltipLines(task, activeInstallTasks).map(
          (line) => (
            <div key={line}>{line}</div>
          ),
        )}
      >
        <Box
          component="span"
          onClick={() => navigate('/app/settings/task-manager')}
          sx={{ display: 'inline-flex', cursor: 'pointer' }}
        >
          {element}
        </Box>
      </Tooltip>
    ) : (
      element
    );
  const activeDbtTasks = activeInstallTasks.filter(
    (task) => task.type === 'install:dbt',
  );
  // Adapters need Python to exist first.
  const isPythonInstalling = activeInstallTasks.some(
    (task) => task.type === 'install:python',
  );
  const getPackageTask = (packageName: string) =>
    activeDbtTasks.find((task) =>
      isSubjectForPackage(task.subject, packageName),
    );
  const dbtRuntimeTask = activeDbtTasks.find((task) =>
    isDbtRuntimeSubject(task.subject),
  );
  const hasQueuedAdapterInstalls = activeDbtTasks.some(
    (task) => !isDbtRuntimeSubject(task.subject),
  );
  const queuedDbtTasks = activeDbtTasks.filter(
    (task) => task.status === 'pending',
  );
  const runningDbtTask = activeDbtTasks.find(
    (task) => task.status === 'running',
  );
  // v1 adapters require dbt-core < 2.0, so one installed after a switch to v2
  // would bring dbt-core back next to dbt-oss. Adapters wait while a v2
  // switch is queued or running.
  const isV2SwitchActive = isDbtV2SwitchSubject(dbtRuntimeTask?.subject);
  const isAdapterInstallBlocked = isPythonInstalling || isV2SwitchActive;

  // Installs keep running after this page closes, and the background process
  // saves their results itself. A closed page's settings copy is out of date,
  // so it must not save over them.
  const isPageOpenRef = React.useRef(true);
  React.useEffect(() => {
    isPageOpenRef.current = true;
    return () => {
      isPageOpenRef.current = false;
    };
  }, []);
  const saveSettingIfPageOpen = async (name: string, value: string) => {
    if (isPageOpenRef.current) await onInstallDbtSave(name, value);
  };

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
  // Package checks run pip and take seconds, so they can overlap. Only the
  // newest check or row update counts: a check that finishes after a newer
  // one is dropped instead of undoing it.
  const latestInstalledPackagesChangeRef = React.useRef(0);
  const changeInstalledPackages: typeof setInstalledPackages = (change) => {
    latestInstalledPackagesChangeRef.current += 1;
    setInstalledPackages(change);
  };
  const reloadInstalledPackages = async (
    clearOnError: boolean,
  ): Promise<void> => {
    latestInstalledPackagesChangeRef.current += 1;
    const thisChange = latestInstalledPackagesChangeRef.current;
    let packages: { [key: string]: string } | null = null;
    try {
      packages = (await getInstalledPackages()).packages;
    } catch {
      if (clearOnError) packages = {};
    }
    if (packages && thisChange === latestInstalledPackagesChangeRef.current) {
      setInstalledPackages(packages);
    }
  };

  const [dbtCoreVersions, setDbtCoreVersions] =
    React.useState<DbtVersionListResponse | null>(null);
  const [isCheckingDbtCoreVersions, setIsCheckingDbtCoreVersions] =
    React.useState(false);
  const [showOlderVersions, setShowOlderVersions] = React.useState(false);
  const [isVersionListOpen, setIsVersionListOpen] = React.useState(false);
  // Which runtime's versions are shown; null follows the active runtime.
  const [viewedRuntime, setViewedRuntime] = React.useState<'v1' | 'v2' | null>(
    null,
  );
  // Activate was clicked on the runtime that is not installed.
  const [isActivatingRuntime, setIsActivatingRuntime] = React.useState(false);
  // Version picked in the dropdown; null means the latest stable.
  const [selectedInstallVersion, setSelectedInstallVersion] = React.useState<
    string | null
  >(null);
  const warningStyle = useSettingsWarningStyle();
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

  // Each queued install reports on its own, so failures add up in the error
  // box instead of replacing each other. A cancelled install is not an error.
  function addInstallError(message: string) {
    setVersionChangeResult((previous) => ({
      ok: false,
      error:
        previous && !previous.ok
          ? [previous.error, message].filter(Boolean).join('\n')
          : message,
    }));
  }

  async function runQueuedInstall(
    packageName: string,
    request: () => Promise<PythonPackageInstallVersionResponse>,
  ): Promise<PythonPackageInstallVersionResponse | null> {
    try {
      const result = await request();
      if (!result.ok) {
        addInstallError(
          `${packageName}: ${result.error || `Unable to install ${packageName}.`}`,
        );
      }
      return result;
    } catch (error) {
      if (!isInstallCancelledError(error)) {
        addInstallError(
          `${packageName}: ${error instanceof Error ? error.message : 'Install failed.'}`,
        );
      }
      return null;
    }
  }

  const handleInstallDbt = async () => {
    const allPackages = ['dbt-core', ...DBT_ADAPTER_PACKAGES, 'sqlglot'];

    const packages = allPackages.filter((pkg) => selectedPackages[pkg]);

    setIsLoadingInstall(true);
    setInstallProgress(0);
    setVersionChangeResult(null);

    try {
      let { pythonPath } = settings;
      if (!pythonPath) {
        toast.info(
          'Python is required for dbt Core v1 and will be installed automatically.',
        );
        const pythonResult = await installPython.mutateAsync();
        if (!pythonResult.success) {
          throw new Error(`Failed to install Python: ${pythonResult.error}`);
        }
        pythonPath = pythonResult.path;
        await saveSettingIfPageOpen('pythonPath', pythonResult.path);
        await saveSettingIfPageOpen('pythonVersion', pythonResult.version);
      }

      const availableDbtVersions =
        dbtCoreVersions ?? (await listDbtCoreVersions({ limit: 100 }));
      // This flow installs Python adapter packages, which only dbt Core v1 uses.
      const targetDbtVersion = availableDbtVersions.versions.find(
        (item) => Number.parseInt(item.version, 10) === 1 && !item.isPrerelease,
      )?.version;
      if (!targetDbtVersion) {
        throw new Error('No stable dbt Core v1 version is available.');
      }

      // dbt-core goes first; if it fails, the adapters after it are skipped.
      if (packages.includes('dbt-core')) {
        setCurrentPackage('dbt-core');
        const result = await runQueuedInstall('dbt-core', () =>
          installPackageVersion({
            pythonPath,
            packageName: 'dbt-core',
            version: targetDbtVersion,
          }),
        );
        if (!result?.ok) return;
        if (result.dbtPath) {
          saveSettingIfPageOpen('dbtPath', result.dbtPath);
        }
        if (result.installedVersion) {
          saveSettingIfPageOpen('dbtVersion', result.installedVersion);
        }
      }

      // The rest go into the queue at once (it keeps this order), so each
      // row shows "Queued" right away.
      const rest = packages.filter((pkg) => pkg !== 'dbt-core');
      setCurrentPackage(rest.join(', '));
      let finishedCount = 0;
      await Promise.all(
        rest.map(async (pkg) => {
          await runQueuedInstall(pkg, () =>
            installLatestPackage({ pythonPath, packageName: pkg }),
          );
          finishedCount += 1;
          setInstallProgress((finishedCount / rest.length) * 100);
        }),
      );
      setInstallProgress(100);
      // eslint-disable-next-line no-use-before-define
      await checkInstalledPackages();
    } finally {
      setIsLoadingInstall(false);
      setCurrentPackage('');
    }
  };

  async function checkInstalledPackages(): Promise<void> {
    if (isCheckingPackages) return;

    setIsCheckingPackages(true);
    try {
      await reloadInstalledPackages(true);
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
    const result = await runQueuedInstall(packageName, () =>
      installPackageVersion({
        pythonPath: settings.pythonPath,
        packageName,
        version,
      }),
    );
    if (result?.ok && result.installedVersion) {
      changeInstalledPackages((prev) => ({
        ...prev,
        [packageName]: result.installedVersion as string,
      }));
    }
  };

  const ensurePythonForVersion = async (version: string): Promise<boolean> => {
    if (settings.pythonPath) return true;

    // v2 is a pip wheel too, but needs Python 3.11+ while the automatic
    // install provisions the recommended (older) version.
    if (Number.parseInt(version, 10) >= 2) {
      setVersionChangeResult({
        ok: false,
        error:
          'dbt Core 2.x requires Python 3.11 or newer. Install it from the Python settings first.',
      });
      return false;
    }

    toast.info(
      'Python is required for dbt Core v1 and will be installed automatically.',
    );
    try {
      const result = await installPython.mutateAsync();
      if (!result.success) {
        setVersionChangeResult({
          ok: false,
          error: `Failed to install Python: ${result.error}`,
        });
        return false;
      }
      await saveSettingIfPageOpen('pythonPath', result.path);
      await saveSettingIfPageOpen('pythonVersion', result.version);
      return true;
    } catch (error) {
      setVersionChangeResult({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Failed to install Python.',
      });
      return false;
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
    // A switch between v1 and v2 drops the dbt installs still waiting: v2
    // brings its own adapters, and a v1 adapter installed after the switch
    // would bring dbt-core back next to dbt-oss. They have not started, so
    // nothing is left half-done; one already running finishes first.
    const { currentVersion, targetVersion } = versionChangePlan;
    const isLineSwitch =
      Boolean(currentVersion) &&
      currentVersion?.startsWith('2.') !== targetVersion.startsWith('2.');
    if (isLineSwitch) {
      await Promise.all(queuedDbtTasks.map((task) => cancelTask(task.id)));
    }
    try {
      const result = await installDbtVersionChange({
        targetVersion: versionChangePlan.targetVersion,
        includeAdapters: true,
        pythonPath: settings.pythonPath,
      });
      setVersionChangeResult(result);
      if (result.ok) {
        if (result.dbtPath) saveSettingIfPageOpen('dbtPath', result.dbtPath);
        if (result.installedVersion) {
          saveSettingIfPageOpen('dbtVersion', result.installedVersion);
        }
        // The new runtime is active now, so show its normal version list.
        setIsActivatingRuntime(false);
        setIsVersionListOpen(true);
        await refreshDbtCoreVersions();
        await checkInstalledPackages();
        if (runProjectCheck) {
          setCompatibilityResult(await checkCurrentProjectCompatibility());
        }
      }
    } catch (error) {
      if (isInstallCancelledError(error)) return;
      setVersionChangeResult({
        ok: false,
        error:
          error instanceof Error ? error.message : 'Version change failed.',
      });
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
    const result = await runQueuedInstall(packageName, () =>
      uninstallPackage({
        pythonPath: settings.pythonPath,
        packageName,
      }),
    );
    if (!result?.ok) return;

    changeInstalledPackages((prev) => {
      const updated = { ...prev };
      delete updated[packageName];
      return updated;
    });

    if (packageName === 'dbt-core') {
      saveSettingIfPageOpen('dbtPath', '');
      saveSettingIfPageOpen('dbtVersion', '');
    }
  };

  const handleInstallSinglePackage = async (packageName: string) => {
    const result = await runQueuedInstall(packageName, () =>
      installLatestPackage({
        pythonPath: settings.pythonPath,
        packageName,
      }),
    );
    if (result?.ok && result.installedVersion) {
      changeInstalledPackages((prev) => ({
        ...prev,
        [packageName]: result.installedVersion as string,
      }));
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
    setVersionChangeResult(null);

    // All go into the queue at once (it keeps this order), so each row shows
    // "Queued" right away.
    const results = await Promise.all(
      toInstall.map(async (pkg) => {
        const result = await runQueuedInstall(pkg, () =>
          installLatestPackage({
            pythonPath: settings.pythonPath,
            packageName: pkg,
          }),
        );
        if (result?.ok && result.installedVersion) {
          changeInstalledPackages((prev) => ({
            ...prev,
            [pkg]: result.installedVersion as string,
          }));
        }
        return result;
      }),
    );

    if (results.every((result) => result?.ok)) {
      toast.success(
        `All ${toInstall.length} adapter(s) installed successfully.`,
      );
    }

    setIsLoadingInstall(false);
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

  // Re-checks the installed adapters whenever a dbt install leaves the queue
  // (finished, failed or cancelled), so rows switch to Uninstall without
  // leaving the page. This also covers installs this page didn't start:
  // Install All, or ones queued before the page was opened.
  const activeDbtTaskIds = activeDbtTasks.map((task) => task.id).join(',');
  const previousActiveDbtTaskIdsRef = React.useRef<string[]>([]);
  useEffect(() => {
    const ids = activeDbtTaskIds ? activeDbtTaskIds.split(',') : [];
    const anInstallLeftTheQueue = previousActiveDbtTaskIdsRef.current.some(
      (id) => !ids.includes(id),
    );
    previousActiveDbtTaskIdsRef.current = ids;
    if (!anInstallLeftTheQueue || !settings.pythonPath) return;
    reloadInstalledPackages(false).catch(() => undefined);
  }, [activeDbtTaskIds, getInstalledPackages, settings.pythonPath]);

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
  const allPythonDbtVersions = availableVersions.filter(
    (item) => Number.parseInt(item.version, 10) === 1 && !item.isPrerelease,
  );
  const allRustDbtVersions = availableVersions.filter(
    (item) => Number.parseInt(item.version, 10) >= 2,
  );
  const pythonDbtVersions = allPythonDbtVersions.slice(
    0,
    showOlderVersions ? 15 : 5,
  );
  const rustDbtVersions = allRustDbtVersions.slice(
    0,
    showOlderVersions ? 15 : 5,
  );

  // Blue "Queued ✕" / "In progress" chip for an install on this page.
  const renderInstallTaskChip = (task: TaskRecord | undefined) => {
    if (task?.status === 'pending') {
      return (
        <Chip
          label={withInstallTaskTooltip(task, <span>Queued</span>)}
          size="small"
          color="info"
          deleteIcon={
            <Tooltip title={CANCEL_QUEUED_TOOLTIP}>
              <Close aria-label="Remove from the queue" />
            </Tooltip>
          }
          onDelete={() => {
            cancelTask(task.id).catch(() => undefined);
          }}
        />
      );
    }
    if (task?.status === 'running') {
      return withInstallTaskTooltip(
        task,
        <Chip label="In progress" size="small" color="info" />,
      );
    }
    return null;
  };

  const hasDbt = Boolean(settings.dbtPath && settings.dbtPath !== 'dbt');
  const isV2Active = Boolean(settings.dbtVersion?.startsWith('2.'));

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

      const isOtherRuntime =
        !!installed &&
        item.version.startsWith('2.') !== installed.startsWith('2.');

      let actionLabel = installed ? 'Downgrade' : 'Install';
      if (isInstalled) {
        actionLabel = 'Active';
      } else if (isOtherRuntime) {
        actionLabel = 'Switch to this version';
      } else if (item.isPrerelease) {
        actionLabel = 'Install Preview';
      } else if (
        installed &&
        compareSimpleVersions(item.version, installed) > 0
      ) {
        actionLabel = 'Upgrade';
      }

      const switchTask =
        dbtRuntimeTask?.subject === `dbt-core@${item.version}`
          ? dbtRuntimeTask
          : undefined;
      if (switchTask) {
        actionLabel = switchTask.status === 'pending' ? 'Queued' : 'Switching…';
      }
      // A switch between v1 and v2 can always be chosen: confirming it
      // cancels the dbt installs still in the queue (see
      // confirmDbtVersionChange). Within one line, one switch waits at a time.
      const isRuntimeLineSwitch =
        hasDbt && Number.parseInt(item.version, 10) >= 2 !== isV2Active;

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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            {withInstallTaskTooltip(
              switchTask,
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  prepareDbtVersionChange(item.version).catch(() => undefined);
                }}
                disabled={
                  isInstalled ||
                  isLoadingDialog ||
                  isPythonInstalling ||
                  Boolean(switchTask) ||
                  (Boolean(dbtRuntimeTask) && !isRuntimeLineSwitch)
                }
                startIcon={
                  switchTask?.status === 'running' ? (
                    <CircularProgress size={14} />
                  ) : (
                    <Download />
                  )
                }
              >
                {actionLabel}
              </Button>,
            )}
            {switchTask?.status === 'pending' && (
              <CancelQueuedButton
                onCancel={() => {
                  cancelTask(switchTask.id).catch(() => undefined);
                }}
              />
            )}
          </Box>
        </SettingsRow>
      );
    });
  };

  const getRuntimeShort = (version: string) =>
    version.startsWith('2.') ? 'v2' : 'v1';
  const getRuntimeLabel = (version: string) =>
    version.startsWith('2.') ? 'dbt Core v2 · Rust' : 'dbt Core v1 · Python';

  // Text for the version change dialog, built only from the existing plan.
  const planCurrentVersion = versionChangePlan?.currentVersion ?? null;
  const planTargetVersion = versionChangePlan?.targetVersion ?? '';
  const isRuntimeSwitch = Boolean(
    planCurrentVersion &&
      planTargetVersion &&
      getRuntimeShort(planCurrentVersion) !==
        getRuntimeShort(planTargetVersion),
  );
  let versionChangeTitle = 'Change dbt Core version?';
  let versionChangeConfirmLabel = 'Confirm version change';
  if (!planCurrentVersion) {
    versionChangeTitle = `Install ${getRuntimeLabel(planTargetVersion)}?`;
    versionChangeConfirmLabel = 'Install';
  } else if (isRuntimeSwitch) {
    versionChangeTitle = `Switch to dbt Core ${getRuntimeShort(
      planTargetVersion,
    )}?`;
    versionChangeConfirmLabel = `Switch to ${getRuntimeShort(
      planTargetVersion,
    )}`;
  }
  const versionChangeSteps: string[] = [];
  if (!planCurrentVersion) {
    versionChangeSteps.push(
      `${getRuntimeLabel(planTargetVersion)} ${planTargetVersion} will be installed.`,
    );
  } else if (isRuntimeSwitch) {
    versionChangeSteps.push(
      `${getRuntimeLabel(planCurrentVersion)} ${planCurrentVersion} will be uninstalled.`,
      `${getRuntimeLabel(planTargetVersion)} ${planTargetVersion} will be installed.`,
      'Your adapter packages stay installed.',
    );
    if (planTargetVersion.startsWith('2.')) {
      versionChangeSteps.push(
        'dbt Core v2 comes with its own adapters (Snowflake, BigQuery, Redshift, Databricks, DuckDB); Postgres and Kinetica are not supported on v2.',
      );
    }
    if (queuedDbtTasks.length > 0) {
      versionChangeSteps.push(
        `${queuedDbtTasks.length} queued dbt install${
          queuedDbtTasks.length === 1 ? '' : 's'
        } will be cancelled: ${queuedDbtTasks
          .map((task) => task.subject ?? task.label)
          .join(', ')}.`,
      );
    }
    if (runningDbtTask) {
      versionChangeSteps.push(
        `${runningDbtTask.label} is running now and finishes first.`,
      );
    }
  } else {
    versionChangeSteps.push(
      `${getRuntimeLabel(planTargetVersion)} ${planCurrentVersion} will be replaced by ${planTargetVersion} (${versionChangePlan?.direction}).`,
    );
  }
  if (
    versionChangePlan?.direction === 'downgrade' &&
    hasQueuedAdapterInstalls
  ) {
    versionChangeSteps.push(
      'Adapter installs queued before this can raise dbt-core again; check the version after.',
    );
  }
  if (versionChangePlan?.rollbackVersion) {
    versionChangeSteps.push(
      `You can roll back to ${versionChangePlan.rollbackVersion} afterwards.`,
    );
  }

  const activeRuntime: 'v1' | 'v2' = isV2Active ? 'v2' : 'v1';
  const shownRuntime = viewedRuntime ?? activeRuntime;
  const isShownRuntimeActive = hasDbt && shownRuntime === activeRuntime;

  // The toggle picks which runtime is shown (the header pill shows what is
  // installed). The installed runtime shows its version list; the other one
  // shows an Activate button, then a version dropdown and an Install button.

  const showRuntimeVersions = (runtime: 'v1' | 'v2') => {
    setViewedRuntime(runtime);
    setIsVersionListOpen(hasDbt && runtime === activeRuntime);
    setIsActivatingRuntime(false);
    setSelectedInstallVersion(null);
  };

  // Same cap as the version list with "Show older versions" expanded.
  const shownRuntimeVersions = (
    shownRuntime === 'v1' ? allPythonDbtVersions : allRustDbtVersions
  ).slice(0, 15);
  const latestStableShownVersion =
    shownRuntimeVersions.find(
      (item) => item.isLatestStable && !item.isPrerelease,
    )?.version ??
    shownRuntimeVersions[0]?.version ??
    '';
  const versionToInstall = selectedInstallVersion ?? latestStableShownVersion;
  // The picked version's switch while it is queued or running.
  const activationTask =
    dbtRuntimeTask?.subject === `dbt-core@${versionToInstall}`
      ? dbtRuntimeTask
      : undefined;
  let activationLabel = 'Install';
  if (activationTask) {
    activationLabel =
      activationTask.status === 'pending' ? 'Queued' : 'Switching…';
  }

  const renderRuntimeVersions = (
    versions: DbtVersionListResponse['versions'],
    emptyMessage: string,
    hasOlderVersions: boolean,
  ) => (
    <Box
      sx={(theme) => ({
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 1,
        '& > * + *': {
          borderTop: `1px solid ${theme.palette.divider}`,
        },
      })}
    >
      {renderVersionList(versions, emptyMessage)}
      {hasOlderVersions && (
        <Box sx={{ px: 1.75, py: 0.75, textAlign: 'center' }}>
          <Button
            size="small"
            onClick={() => setShowOlderVersions((value) => !value)}
          >
            {showOlderVersions ? 'Show fewer' : 'Show older versions'}
          </Button>
        </Box>
      )}
    </Box>
  );

  return (
    <SettingsStack>
      <SettingsSection
        title="dbt™ Core"
        icon={<DbtMonoIcon />}
        badge={
          hasDbt ? (
            <Chip
              label={`${activeRuntime} · ${settings.dbtVersion} installed`}
              size="small"
              color="success"
              variant="outlined"
            />
          ) : (
            <Chip label="Not installed" size="small" variant="outlined" />
          )
        }
        description="Only one runtime can be installed at a time. Changing it affects all local projects."
        action={
          <SettingsRefreshButton
            title="Refresh versions"
            onClick={handleRefreshDbtCoreVersionsClick}
            loading={isCheckingDbtCoreVersions}
          />
        }
      >
        <SettingsRow
          label="Runtime"
          description={
            shownRuntime === 'v1'
              ? 'dbt v1 · Python. Stable runtime. Recommended for production projects and broad adapter compatibility.'
              : 'dbt v2 · Rust. Installed from the Apache-licensed dbt-oss package. Requires Python 3.11+. Cloud pipeline runs are unavailable while v2 is active.'
          }
        >
          {/* Clicking the runtime that is not installed shows a version
              dropdown and a switch button under the toggle. */}
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
              width: 200,
            }}
          >
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              value={shownRuntime}
              sx={{
                flexShrink: 0,
                '& .MuiToggleButton-root': {
                  textTransform: 'none',
                  fontSize: 12,
                  py: 0.25,
                  px: 1.25,
                  whiteSpace: 'nowrap',
                },
              }}
            >
              <ToggleButton
                value="v1"
                aria-label="Show dbt v1 versions"
                onClick={() => showRuntimeVersions('v1')}
              >
                dbt v1
              </ToggleButton>
              <ToggleButton
                value="v2"
                aria-label="Show dbt v2 versions"
                onClick={() => showRuntimeVersions('v2')}
              >
                dbt v2
              </ToggleButton>
            </ToggleButtonGroup>
            {!isShownRuntimeActive && !isActivatingRuntime && (
              <Button
                fullWidth
                size="small"
                variant="contained"
                onClick={() => setIsActivatingRuntime(true)}
                startIcon={<Download />}
              >
                {hasDbt
                  ? `Activate ${shownRuntime}`
                  : `Install ${shownRuntime}`}
              </Button>
            )}
            {!isShownRuntimeActive &&
              isActivatingRuntime &&
              shownRuntimeVersions.length > 0 && (
                <>
                  <TextField
                    select
                    fullWidth
                    size="small"
                    value={versionToInstall}
                    onChange={(event) =>
                      setSelectedInstallVersion(event.target.value)
                    }
                    inputProps={{
                      'aria-label': `dbt ${shownRuntime} version to install`,
                    }}
                  >
                    {shownRuntimeVersions.map((item) => (
                      <MenuItem key={item.version} value={item.version}>
                        {item.version}
                        {item.isLatestStable && !item.isPrerelease
                          ? ' (latest stable)'
                          : ''}
                        {item.isPrerelease ? ' (preview)' : ''}
                      </MenuItem>
                    ))}
                  </TextField>
                  {/* Switching runtimes can always be chosen: confirming it
                      cancels the dbt installs still in the queue. */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Box sx={{ flex: 1, display: 'flex' }}>
                      {withInstallTaskTooltip(
                        activationTask,
                        <Button
                          fullWidth
                          size="small"
                          variant="contained"
                          onClick={() => {
                            prepareDbtVersionChange(versionToInstall).catch(
                              () => undefined,
                            );
                          }}
                          disabled={
                            isLoadingDialog ||
                            isLoadingInstall ||
                            isPythonInstalling ||
                            Boolean(activationTask)
                          }
                          startIcon={
                            activationTask?.status === 'running' ? (
                              <CircularProgress size={14} />
                            ) : (
                              <Download />
                            )
                          }
                        >
                          {activationLabel}
                        </Button>,
                      )}
                    </Box>
                    {activationTask?.status === 'pending' && (
                      <CancelQueuedButton
                        onCancel={() => {
                          cancelTask(activationTask.id).catch(() => undefined);
                        }}
                      />
                    )}
                  </Box>
                </>
              )}
          </Box>
        </SettingsRow>

        {/* Only the installed runtime has a version list. */}
        {isShownRuntimeActive && (
          <SettingsRow label={`dbt ${shownRuntime} versions`}>
            {/* A queued or running dbt Core switch, visible with the list
                closed. */}
            {renderInstallTaskChip(dbtRuntimeTask)}
            <IconButton
              size="small"
              onClick={() => setIsVersionListOpen((open) => !open)}
              aria-label={isVersionListOpen ? 'Hide versions' : 'Show versions'}
            >
              <ExpandMore
                fontSize="small"
                sx={{
                  transform: isVersionListOpen ? 'rotate(180deg)' : 'none',
                  transition: 'transform 0.15s',
                }}
              />
            </IconButton>
          </SettingsRow>
        )}
        {isShownRuntimeActive && isVersionListOpen && (
          <SettingsSectionBody>
            {shownRuntime === 'v1'
              ? renderRuntimeVersions(
                  pythonDbtVersions,
                  'No dbt v1 releases are available.',
                  allPythonDbtVersions.length > 5,
                )
              : renderRuntimeVersions(
                  rustDbtVersions,
                  'No dbt v2 releases are available.',
                  allRustDbtVersions.length > 5,
                )}
          </SettingsSectionBody>
        )}

        {hasDbt && isV2Active && (
          <SettingsSectionBody>
            <Alert severity="warning">
              Cloud pipeline runs and other cloud features are unavailable while
              dbt v2 is active.
            </Alert>
          </SettingsSectionBody>
        )}

        <SettingsRow
          label="dbt Path"
          description={settings.dbtPath || 'Not installed'}
        />
        {settings.pythonPath && settings.pythonVersion && (
          <SettingsRow
            label="Python environment"
            description={settings.pythonPath}
          >
            <Chip size="small" label={settings.pythonVersion} />
          </SettingsRow>
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
              disabled={
                isLoadingInstall || isLoadingDialog || isAdapterInstallBlocked
              }
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
            // One action per adapter: while one of its installs is queued or
            // running, its other buttons wait.
            const packageTask = getPackageTask(pkg);
            const isPackageBusy =
              Boolean(packageTask) ||
              isAdapterInstallBlocked ||
              isLoadingDialog;

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
                      {renderInstallTaskChip(packageTask)}
                    </Box>
                  }
                  description={packageDescriptions[pkg]}
                >
                  {!installSource && (
                    <SettingsRefreshButton
                      title="Refresh versions"
                      onClick={() => {
                        fetchPackageVersions(pkg).catch(() => undefined);
                        if (!isExpanded) {
                          setExpandedPackage(pkg);
                        }
                      }}
                      loading={isLoading}
                    />
                  )}
                  {installSource && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => {
                        handleInstallSinglePackage(pkg).catch(() => undefined);
                      }}
                      disabled={isPackageBusy}
                      startIcon={<Download />}
                    >
                      {installed ? 'Update from source' : 'Install'}
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
                      disabled={isPackageBusy}
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
                          const versionTask =
                            packageTask?.subject === `${pkg}@${v.version}`
                              ? packageTask
                              : undefined;

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
                          if (versionTask) {
                            actionLabel =
                              versionTask.status === 'pending'
                                ? 'Queued'
                                : 'Installing…';
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
                              <Box
                                sx={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 0.5,
                                }}
                              >
                                {withInstallTaskTooltip(
                                  versionTask,
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    onClick={() => {
                                      installSinglePackageVersion(
                                        pkg,
                                        v.version,
                                      ).catch(() => undefined);
                                    }}
                                    disabled={isInstalled || isPackageBusy}
                                    startIcon={
                                      versionTask?.status === 'running' ? (
                                        <CircularProgress size={14} />
                                      ) : (
                                        <Download />
                                      )
                                    }
                                  >
                                    {actionLabel}
                                  </Button>,
                                )}
                                {versionTask?.status === 'pending' && (
                                  <CancelQueuedButton
                                    onCancel={() => {
                                      cancelTask(versionTask.id).catch(
                                        () => undefined,
                                      );
                                    }}
                                  />
                                )}
                              </Box>
                            </SettingsRow>
                          );
                        })}
                      </Box>
                    )}

                    {!installSource && versions.length === 0 && (
                      <Typography variant="body2" color="text.secondary">
                        {isLoading
                          ? 'Loading versions...'
                          : 'No versions found.'}
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
                          disabled={
                            Boolean(getPackageTask(pkg)) || isPythonInstalling
                          }
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
                          disabled={
                            Boolean(getPackageTask(pkg)) || isPythonInstalling
                          }
                          startIcon={<GetApp />}
                        >
                          Install
                        </Button>
                      )}
                    </SettingsRow>
                  );
                })
            : (isCheckingPackages && (
                <SettingsRow label="Checking installed packages..." />
              )) || (
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
                isAdapterInstallBlocked ||
                Boolean(dbtRuntimeTask) ||
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
        PaperProps={{ style: warningStyle }}
      >
        <DialogTitle>{versionChangeTitle}</DialogTitle>
        <DialogContent>
          {versionChangePlan && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              <Typography variant="body2" color="text.secondary">
                {isRuntimeSwitch
                  ? "Only one dbt Core runtime can be installed at a time. Here's what will happen:"
                  : "Here's what will happen:"}
              </Typography>

              <Box
                component="ol"
                sx={{
                  m: 0,
                  p: 0,
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 1,
                }}
              >
                {versionChangeSteps.map((step, index) => (
                  <Box
                    component="li"
                    key={step}
                    sx={{
                      display: 'flex',
                      gap: 1.25,
                      alignItems: 'flex-start',
                    }}
                  >
                    <Box
                      sx={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        border: 1,
                        borderColor: 'divider',
                        fontSize: 11,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </Box>
                    <Typography variant="body2">{step}</Typography>
                  </Box>
                ))}
              </Box>

              <Alert
                severity={
                  versionChangePlan.isMajorVersionChange ? 'warning' : 'info'
                }
              >
                <AlertTitle>Be careful</AlertTitle>
                <Box component="ul" sx={{ m: 0, pl: 2 }}>
                  <li>{versionChangePlan.globalImpactWarning}</li>
                  {versionChangePlan.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                  {(versionChangePlan.channel === 'preview' ||
                    versionChangePlan.targetVersion.startsWith('2.')) && (
                    <li>
                      Rosetta will install only the Apache-licensed dbt-core
                      package and will block an ambiguous or proprietary dbt
                      distribution.
                    </li>
                  )}
                </Box>
              </Alert>

              {versionChangePlan.adapters.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Installed adapter compatibility
                  </Typography>
                  {versionChangePlan.adapters.map((adapter) => (
                    <Box
                      key={adapter.packageName}
                      sx={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 1,
                        py: 0.5,
                      }}
                    >
                      <SettingsStatus
                        tone={getAdapterAlertSeverity(adapter.status)}
                      >
                        {adapter.packageName} {adapter.installedVersion}
                      </SettingsStatus>
                      <Typography variant="caption" color="text.secondary">
                        {adapter.message}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}

              <Box>
                <FormControlLabel
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
                  Artifacts and logs are redirected to a temporary directory.
                  dbt deps is not run automatically because it can modify
                  dependencies and require network access.
                </Typography>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsVersionChangeDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={confirmDbtVersionChange}>
            {versionChangeConfirmLabel}
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
