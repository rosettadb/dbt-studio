import React from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
  LinearProgress,
  Button,
} from '@mui/material';
import { Check, DataObjectOutlined } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';
import { SettingsType } from '../../../types/backend';
import { useGetInstalledDbtCore, useInstallPython } from '../../controllers';
import { getPipInstallRequirement } from '../../../shared/dbtAdapterPackages';
import {
  SettingsSection,
  SettingsSectionBody,
} from '../settings/SettingsLayout';
import { SetupInstallStatus } from '../setupInstallStatus';

type AdapterSelectionProps = {
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
  disabled: boolean;
};

const AdapterSelection: React.FC<AdapterSelectionProps> = ({
  adapters,
  selectedAdapters,
  setSelectedAdapters,
  disabled,
}) => {
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        columnGap: 2,
        mb: 1.5,
      }}
    >
      {adapters.map((adapter, index) => (
        <FormControlLabel
          key={adapter.name}
          title={adapter.description}
          sx={{ m: 0 }}
          control={
            <Checkbox
              size="small"
              checked={selectedAdapters.includes(adapter.name)}
              disabled={disabled || index === 0}
              onChange={() => {
                if (selectedAdapters.includes(adapter.name)) {
                  setSelectedAdapters(
                    selectedAdapters.filter((a) => a !== adapter.name),
                  );
                } else {
                  setSelectedAdapters([...selectedAdapters, adapter.name]);
                }
              }}
            />
          }
          label={<Typography sx={{ fontSize: 13 }}>{adapter.name}</Typography>}
        />
      ))}
    </Box>
  );
};

type Props = {
  settings: SettingsType;
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
  isAnyInstallRunning: boolean;
  onInstallingChange: (isInstalling: boolean) => void;
  onInstallComplete: (dbtPath: string, dbtVersion: string) => Promise<void>;
};

export const DbtSetup: React.FC<Props> = ({
  settings,
  selectedAdapters,
  onInstallComplete,
  adapters,
  setSelectedAdapters,
  isAnyInstallRunning,
  onInstallingChange,
}) => {
  const { runCommand } = useCli();
  const installPython = useInstallPython();
  const getInstalledDbtCore = useGetInstalledDbtCore();
  const [loading, setLoading] = React.useState(false);
  const [currentPkg, setCurrentPkg] = React.useState('');
  const [progress, setProgress] = React.useState(0);

  const isInstalled = Boolean(settings.dbtPath);

  const handleInstall = async () => {
    setLoading(true);
    onInstallingChange(true);
    setProgress(0);

    try {
      let { pythonPath } = settings;
      if (!pythonPath) {
        toast.info(
          'Python is required for dbt Core v1 and will be installed automatically.',
        );
        setCurrentPkg('Installing Python...');
        const pythonResult = await installPython.mutateAsync();
        if (!pythonResult.success) {
          toast.error(`Failed to install Python: ${pythonResult.error}`);
          return;
        }
        pythonPath = pythonResult.path;
      }
      const python = pythonPath ? `"${pythonPath}"` : 'python';

      // eslint-disable-next-line no-plusplus
      for (let i = 0; i < selectedAdapters.length; i++) {
        const pkg = selectedAdapters[i];
        setCurrentPkg(pkg);
        setProgress((i / selectedAdapters.length) * 100);
        try {
          // Source-installed adapters (e.g. dbt-kinetica) resolve to a
          // "name @ url" requirement, which needs quoting for the shell.
          const requirement = getPipInstallRequirement(pkg);
          // eslint-disable-next-line no-await-in-loop
          await runCommand(`${python} -m pip install "${requirement}"`);
        } catch {
          // continue
        }
      }

      setCurrentPkg('Locating dbt path...');
      setProgress(100);
      const dbtPath = await settingsServices.getDbtPath();
      const installedDbt = await getInstalledDbtCore();
      await onInstallComplete(
        dbtPath,
        installedDbt.isExecutableVerified && installedDbt.version
          ? installedDbt.version
          : '',
      );
    } catch (error) {
      toast.error(
        `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setLoading(false);
      onInstallingChange(false);
    }
  };

  let installArea: React.ReactNode;
  if (loading) {
    installArea = (
      <Box>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Installing: {currentPkg}
        </Typography>
        <LinearProgress variant="determinate" value={progress} />
      </Box>
    );
  } else if (isInstalled) {
    installArea = (
      <Button
        variant="contained"
        disabled
        data-testid="setup-install-btn"
        startIcon={<Check />}
      >
        Installed
      </Button>
    );
  } else {
    installArea = (
      <Button
        variant="contained"
        onClick={handleInstall}
        disabled={isAnyInstallRunning}
        data-testid="setup-install-btn"
      >
        Install dbt and adapters
      </Button>
    );
  }

  return (
    <SettingsSection
      title="dbt™ Core and adapters"
      icon={<DataObjectOutlined />}
      action={
        <SetupInstallStatus
          isInstalling={loading}
          isInstalled={isInstalled}
          version={settings.dbtVersion}
        />
      }
    >
      <SettingsSectionBody>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Pick the dbt™ adapters you need for your databases.
        </Typography>
        <AdapterSelection
          adapters={adapters}
          selectedAdapters={selectedAdapters}
          setSelectedAdapters={setSelectedAdapters}
          disabled={loading || isInstalled}
        />
        {installArea}
      </SettingsSectionBody>
    </SettingsSection>
  );
};
