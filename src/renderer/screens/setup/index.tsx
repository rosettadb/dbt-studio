import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { toast } from 'react-toastify';
import { useGetSettings, useUpdateSettings } from '../../controllers';
import {
  Loader,
  FinishSetup,
  DbtSetup,
  PythonSetup,
  RunnerSetup,
} from '../../components';
import { client } from '../../config/client';
import { settingsServices } from '../../services';
import {
  DBT_ADAPTER_PACKAGES,
  DBT_ADAPTER_PACKAGE_DESCRIPTIONS,
} from '../../../shared/dbtAdapterPackages';

const ADAPTERS = [
  { name: 'dbt-core', description: 'The core dbt™ package' },
  ...DBT_ADAPTER_PACKAGES.map((name) => ({
    name,
    description: DBT_ADAPTER_PACKAGE_DESCRIPTIONS[name],
  })),
];

const FINAL_STEP = 1;
const STEP_COUNT = 2;

const Setup: React.FC = () => {
  const { data: settings, isLoading } = useGetSettings();
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [selectedAdapters, setSelectedAdapters] = React.useState<string[]>(
    ADAPTERS.map((a) => a.name),
  );
  // Only one install runs at a time; while one runs, the other install
  // buttons, Skip Setup and Next are disabled.
  const [isAnyInstallRunning, setIsAnyInstallRunning] = React.useState(false);

  const handleSkip = async () => {
    if (settings) {
      await updateSettings({ ...settings, isSetup: 'true' });
    }
    await client.get('windows:closeSetup');
  };

  const saveDbtInstall = async (dbtPath: string, dbtVersion: string) => {
    toast.info('Installation completed');
    // Load fresh settings: the dbt install may have installed Python first,
    // and the settings from this render would not have its path yet.
    const latestSettings = await settingsServices.getSettings();
    await updateSettings({ ...latestSettings, dbtPath, dbtVersion });
  };

  React.useEffect(() => {
    if (settings && !isInitialized) {
      if (settings.pythonPath && settings.dbtPath && settings.runnerPath) {
        setCurrentStep(FINAL_STEP);
      }
      setIsInitialized(true);
    }
  }, [settings]);

  if (isLoading) return <Loader />;
  if (!settings) return null;

  const isEverythingInstalled = Boolean(
    settings.pythonPath && settings.dbtPath && settings.runnerPath,
  );

  return (
    <Box
      sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      data-testid="setup-wizard"
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid',
          pb: 1,
          mb: 2,
          flexShrink: 0,
        }}
      >
        <Typography variant="h6" component="h2">
          Rosetta dbt™ Studio - Setup
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          data-testid="setup-step-label"
        >
          Step {currentStep + 1} of {STEP_COUNT}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', pr: 0.5 }}>
        {currentStep === 0 && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <div data-testid="setup-step-python">
              <PythonSetup
                settings={settings}
                isAnyInstallRunning={isAnyInstallRunning}
                onInstallingChange={setIsAnyInstallRunning}
              />
            </div>
            <div data-testid="setup-step-cli">
              <DbtSetup
                settings={settings}
                adapters={ADAPTERS}
                selectedAdapters={selectedAdapters}
                setSelectedAdapters={setSelectedAdapters}
                isAnyInstallRunning={isAnyInstallRunning}
                onInstallingChange={setIsAnyInstallRunning}
                onInstallComplete={saveDbtInstall}
              />
            </div>
            <div data-testid="setup-step-runner">
              <RunnerSetup
                settings={settings}
                isAnyInstallRunning={isAnyInstallRunning}
                onInstallingChange={setIsAnyInstallRunning}
              />
            </div>
          </Box>
        )}
        {currentStep === FINAL_STEP && (
          <div data-testid="setup-step-complete" style={{ width: '100%' }}>
            <FinishSetup settings={settings} />
          </div>
        )}
      </Box>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          pt: 2,
          flexShrink: 0,
        }}
      >
        <Button
          variant="outlined"
          data-testid="setup-skip-btn"
          disabled={isAnyInstallRunning}
          onClick={handleSkip}
        >
          Skip Setup
        </Button>
        <Button
          variant="contained"
          disabled={
            isAnyInstallRunning || (currentStep === 0 && !isEverythingInstalled)
          }
          style={{ marginLeft: 'auto' }}
          data-testid={
            currentStep === FINAL_STEP ? 'setup-finish-btn' : 'setup-next-btn'
          }
          onClick={() => {
            if (currentStep === FINAL_STEP) {
              handleSkip();
              return;
            }
            setCurrentStep(currentStep + 1);
          }}
        >
          {currentStep === FINAL_STEP ? 'Finish' : 'Next'}
        </Button>
      </Box>
    </Box>
  );
};

export default Setup;
