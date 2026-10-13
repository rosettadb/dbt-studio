import React from 'react';
import {
  Box,
  Button,
  CircularProgress,
  LinearProgress,
  Typography,
} from '@mui/material';
import {
  AccountTreeOutlined,
  CodeOutlined,
  DataObjectOutlined,
  TerminalOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { settingsServices } from '../../services';
import {
  getInstalledDbtCore,
  installLatestPackage,
  installPackageVersion,
  listDbtCoreVersions,
} from '../../services/dbtVersions.service';
import { flowfileInstall } from '../../services/flowfile.service';
import { InstallResult } from '../../../types/backend';
import { SettingsStatus } from '../settings/SettingsLayout';
import { DbtLine } from '../dbtSetup';

type RowKey = 'python' | 'dbt' | 'runner' | 'flowfile';

type RowState = {
  status: 'waiting' | 'installing' | 'done' | 'failed';
  version?: string;
  path?: string;
  error?: string;
  warning?: string;
  // What is being installed right now, and how far along (dbt only).
  detail?: string;
  progress?: number;
};

type InstalledItem = { version?: string; path?: string };

const ROW_ICONS: Record<RowKey, React.ReactElement> = {
  python: <CodeOutlined fontSize="small" />,
  dbt: <DataObjectOutlined fontSize="small" />,
  runner: <TerminalOutlined fontSize="small" />,
  flowfile: <AccountTreeOutlined fontSize="small" />,
};

const isPythonReadyForDbtV2 = (pythonVersion?: string) => {
  const [major, minor] = (pythonVersion || '').split('.').map(Number);
  return major > 3 || (major === 3 && minor >= 11);
};

const toInstalledItem = (result: InstallResult): InstalledItem => {
  if (!result.success) throw new Error(result.error || 'Installation failed.');
  result.warnings?.forEach((warning) => toast.warning(warning));
  return { version: result.version, path: result.path };
};

type Props = {
  dbtLine: DbtLine;
  // null when the version list couldn't load: install the line's latest.
  dbtVersion: string | null;
  selectedAdapters: string[];
  includeFlowfile: boolean;
  onRunningChange: (isRunning: boolean) => void;
};

// Installs Python, dbt, the local runner and (optionally) Flowfile one after
// another. Python goes first: switching its version wipes everything that
// was pip-installed into it.
export const SetupInstallProgress: React.FC<Props> = ({
  dbtLine,
  dbtVersion,
  selectedAdapters,
  includeFlowfile,
  onRunningChange,
}) => {
  const rowKeys: RowKey[] = [
    'python',
    'dbt',
    'runner',
    ...(includeFlowfile ? (['flowfile'] as RowKey[]) : []),
  ];
  const adapterPackages =
    dbtLine === 'v1' ? selectedAdapters.filter((a) => a !== 'dbt-core') : [];
  const dbtLabel = `dbt Core ${dbtVersion ?? (dbtLine === 'v1' ? '1.x' : '2.x')}`;
  const rowLabels: Record<RowKey, string> = {
    python: 'Python',
    dbt:
      dbtLine === 'v1'
        ? `${dbtLabel} and ${adapterPackages.length} adapters`
        : `${dbtLabel} with built-in adapters`,
    runner: 'Local runner',
    flowfile: 'Flowfile',
  };

  const [rows, setRows] = React.useState<Record<RowKey, RowState>>({
    python: { status: 'waiting' },
    dbt: { status: 'waiting' },
    runner: { status: 'waiting' },
    flowfile: { status: 'waiting' },
  });
  const [isRunning, setIsRunning] = React.useState(false);

  const updateRow = (key: RowKey, patch: Partial<RowState>) =>
    setRows((previous) => ({
      ...previous,
      [key]: { ...previous[key], ...patch },
    }));

  const installPythonStep = async (): Promise<InstalledItem> => {
    const settings = await settingsServices.getSettings();
    if (dbtLine === 'v2' && !isPythonReadyForDbtV2(settings.pythonVersion)) {
      const { availableVersions } =
        await settingsServices.checkPythonVersions();
      const target = availableVersions.find((v) =>
        isPythonReadyForDbtV2(v.version),
      );
      if (!target) {
        throw new Error('No Python 3.11 or newer is available to install.');
      }
      updateRow('python', {
        detail: `Installing Python ${target.version} for dbt 2.x...`,
      });
      return toInstalledItem(
        await settingsServices.installPythonVersion(target.version),
      );
    }
    if (settings.pythonPath) {
      return { version: settings.pythonVersion, path: settings.pythonPath };
    }
    return toInstalledItem(await settingsServices.installPython());
  };

  const installDbtStep = async (): Promise<InstalledItem> => {
    const settings = await settingsServices.getSettings();
    if (!settings.pythonPath) {
      throw new Error('Python is not installed. Retry Python first.');
    }
    if (dbtLine === 'v2' && !isPythonReadyForDbtV2(settings.pythonVersion)) {
      throw new Error(
        'dbt 2.x needs Python 3.11 or newer. Retry Python first.',
      );
    }

    let targetVersion = dbtVersion;
    if (!targetVersion) {
      const major = dbtLine === 'v2' ? 2 : 1;
      const { versions } = await listDbtCoreVersions({ limit: 100 });
      targetVersion =
        versions.find(
          (item) =>
            item.isLatestStable && Number.parseInt(item.version, 10) === major,
        )?.version ?? null;
      if (!targetVersion) {
        throw new Error(`No stable dbt Core ${major}.x release is available.`);
      }
    }

    const total = adapterPackages.length + 1;
    updateRow('dbt', {
      detail: `Installing dbt Core ${targetVersion} (1 of ${total})`,
      progress: 0,
    });
    // Installs dbt-core for 1.x and dbt-oss for 2.x, and saves dbtPath and
    // dbtVersion to settings.
    const dbtResult = await installPackageVersion({
      pythonPath: settings.pythonPath,
      packageName: 'dbt-core',
      version: targetVersion,
    });
    if (!dbtResult.ok) {
      throw new Error(dbtResult.error || 'dbt Core installation failed.');
    }

    const failedAdapters: string[] = [];
    // eslint-disable-next-line no-restricted-syntax
    for (const [index, packageName] of adapterPackages.entries()) {
      updateRow('dbt', {
        detail: `Installing ${packageName} (${index + 2} of ${total})`,
        progress: ((index + 1) / total) * 100,
      });
      // eslint-disable-next-line no-await-in-loop
      const result = await installLatestPackage({
        pythonPath: settings.pythonPath,
        packageName,
      });
      if (!result.ok) failedAdapters.push(packageName);
    }

    // The newest adapters can make pip move dbt-core to another version.
    // Report it, and keep the saved dbt version truthful.
    let { installedVersion } = dbtResult;
    if (adapterPackages.length > 0) {
      const installedDbt = await getInstalledDbtCore();
      if (installedDbt.version && installedDbt.version !== installedVersion) {
        installedVersion = installedDbt.version;
        const latestSettings = await settingsServices.getSettings();
        await settingsServices.updateSettings({
          ...latestSettings,
          dbtVersion: installedVersion,
        });
        updateRow('dbt', {
          warning: `An adapter changed dbt to ${installedVersion}.`,
        });
      }
    }

    if (failedAdapters.length > 0) {
      throw new Error(
        `dbt Core installed, but these adapters failed: ${failedAdapters.join(', ')}`,
      );
    }
    return { version: installedVersion, path: dbtResult.dbtPath };
  };

  const installRunnerStep = async (): Promise<InstalledItem> => {
    const settings = await settingsServices.getSettings();
    if (settings.runnerPath) {
      return { version: settings.runnerVersion, path: settings.runnerPath };
    }
    const { latestStable } = await settingsServices.checkRunnerVersions();
    if (!latestStable) {
      throw new Error('No local runner release is available.');
    }
    return toInstalledItem(
      await settingsServices.installRunnerVersion(latestStable),
    );
  };

  const installFlowfileStep = async (): Promise<InstalledItem> => {
    const result = await flowfileInstall();
    if (!result.ok) {
      throw new Error(result.error || 'Flowfile installation failed.');
    }
    const settings = await settingsServices.getSettings();
    return { version: settings.flowfileVersion };
  };

  const installSteps: Record<RowKey, () => Promise<InstalledItem>> = {
    python: installPythonStep,
    dbt: installDbtStep,
    runner: installRunnerStep,
    flowfile: installFlowfileStep,
  };

  const runRows = async (keys: RowKey[]) => {
    setIsRunning(true);
    onRunningChange(true);
    // eslint-disable-next-line no-restricted-syntax
    for (const key of keys) {
      updateRow(key, {
        status: 'installing',
        error: undefined,
        warning: undefined,
        detail: undefined,
        progress: undefined,
      });
      try {
        // eslint-disable-next-line no-await-in-loop
        const installed = await installSteps[key]();
        updateRow(key, { status: 'done', detail: undefined, ...installed });
      } catch (error) {
        updateRow(key, {
          status: 'failed',
          detail: undefined,
          error:
            error instanceof Error ? error.message : 'Installation failed.',
        });
      }
    }
    setIsRunning(false);
    onRunningChange(false);
  };

  React.useEffect(() => {
    runRows(rowKeys);
  }, []);

  const renderStatus = (key: RowKey) => {
    const row = rows[key];
    if (row.status === 'installing') {
      return (
        <Box
          component="span"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.75,
            fontSize: 12,
            color: 'primary.main',
          }}
        >
          <CircularProgress size={12} />
          Installing
        </Box>
      );
    }
    if (row.status === 'done') {
      return (
        <SettingsStatus tone="success">
          {row.version ? `v${row.version}` : 'Installed'}
        </SettingsStatus>
      );
    }
    if (row.status === 'failed') {
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <SettingsStatus tone="error">Failed</SettingsStatus>
          <Button
            size="small"
            variant="outlined"
            disabled={isRunning}
            onClick={() => runRows([key])}
            data-testid={`setup-retry-${key}`}
          >
            Retry
          </Button>
        </Box>
      );
    }
    return <SettingsStatus tone="neutral">Waiting</SettingsStatus>;
  };

  const renderRowDetail = (key: RowKey) => {
    const row = rows[key];
    if (row.status === 'installing' && row.detail) {
      return (
        <>
          <Typography variant="caption" color="text.secondary">
            {row.detail}
          </Typography>
          <LinearProgress
            variant={
              row.progress === undefined ? 'indeterminate' : 'determinate'
            }
            value={row.progress}
            sx={{ mt: 0.5 }}
          />
        </>
      );
    }
    if (row.status === 'installing') return <LinearProgress sx={{ mt: 0.5 }} />;
    if (row.status === 'failed') {
      return (
        // pip errors can run to dozens of lines; show three, full text on hover.
        <Typography
          variant="caption"
          color="error"
          title={row.error}
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            overflowWrap: 'anywhere',
          }}
        >
          {row.error}
        </Typography>
      );
    }
    if (row.status === 'done') {
      return (
        <>
          {row.warning && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: 'block' }}
            >
              {row.warning}
            </Typography>
          )}
          {row.path && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', overflowWrap: 'anywhere' }}
            >
              {row.path}
            </Typography>
          )}
        </>
      );
    }
    return null;
  };

  const hasFailedRow = rowKeys.some((key) => rows[key].status === 'failed');

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        {rowKeys.map((key, index) => (
          <Box
            key={key}
            data-testid={`setup-install-row-${key}`}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              px: 1.75,
              py: 1.25,
              borderTop: index === 0 ? 'none' : '1px solid',
              borderColor: 'divider',
              color: 'text.secondary',
            }}
          >
            {ROW_ICONS[key]}
            <Box sx={{ flex: 1, minWidth: 0, color: 'text.primary' }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                {rowLabels[key]}
              </Typography>
              {renderRowDetail(key)}
            </Box>
            {renderStatus(key)}
          </Box>
        ))}
      </Box>
      {hasFailedRow && !isRunning && (
        <Typography variant="body2" color="text.secondary">
          You can also install anything that failed later from Settings.
        </Typography>
      )}
    </Box>
  );
};
