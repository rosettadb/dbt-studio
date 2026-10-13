import React from 'react';
import { Box, Button, Typography } from '@mui/material';
import { useUpdateSettings } from '../../controllers';
import {
  DbtSetup,
  DbtLine,
  FlowfileSetup,
  SetupInstallProgress,
} from '../../components';
import { client } from '../../config/client';
import { settingsServices } from '../../services';
import { listDbtCoreVersions } from '../../services/dbtVersions.service';
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

const DBT_STEP = 0;
const FLOWFILE_STEP = 1;
const INSTALL_STEP = 2;
const STEP_COUNT = 3;

const Setup: React.FC = () => {
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const [currentStep, setCurrentStep] = React.useState(DBT_STEP);
  const [dbtLine, setDbtLine] = React.useState<DbtLine>('v1');
  const [availableDbtVersions, setAvailableDbtVersions] = React.useState<
    string[] | null
  >(null);
  const [chosenDbtVersions, setChosenDbtVersions] = React.useState<
    Record<DbtLine, string | null>
  >({ v1: null, v2: null });
  const [selectedAdapters, setSelectedAdapters] = React.useState<string[]>(
    ADAPTERS.map((a) => a.name),
  );
  const [includeFlowfile, setIncludeFlowfile] = React.useState(false);
  const [isInstalling, setIsInstalling] = React.useState(false);

  React.useEffect(() => {
    const loadDbtVersions = async () => {
      try {
        // Stable only (the default), newest first, so each line's first
        // match is its latest.
        const { versions } = await listDbtCoreVersions({ limit: 100 });
        const stableVersions = versions.map((item) => item.version);
        const newestOf = (major: number) =>
          stableVersions.find((v) => Number.parseInt(v, 10) === major) ?? null;
        setChosenDbtVersions({ v1: newestOf(1), v2: newestOf(2) });
        setAvailableDbtVersions(stableVersions);
      } catch {
        // No list (e.g. offline): the dropdowns show "Latest" and the
        // install step looks the latest version up itself.
        setAvailableDbtVersions([]);
      }
    };
    loadDbtVersions();
  }, []);

  const finishSetup = async () => {
    // Load fresh settings: the installs saved new paths and versions that
    // this screen never loaded.
    const latestSettings = await settingsServices.getSettings();
    await updateSettings({ ...latestSettings, isSetup: 'true' });
    await client.get('windows:closeSetup');
  };

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
          mb: 1.5,
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
        {currentStep === DBT_STEP && (
          <div data-testid="setup-step-cli">
            <DbtSetup
              dbtLine={dbtLine}
              setDbtLine={setDbtLine}
              availableVersions={availableDbtVersions}
              chosenVersions={chosenDbtVersions}
              setChosenVersion={(line, version) =>
                setChosenDbtVersions((previous) => ({
                  ...previous,
                  [line]: version,
                }))
              }
              adapters={ADAPTERS}
              selectedAdapters={selectedAdapters}
              setSelectedAdapters={setSelectedAdapters}
            />
          </div>
        )}
        {currentStep === FLOWFILE_STEP && (
          <div data-testid="setup-step-flowfile">
            <FlowfileSetup
              includeFlowfile={includeFlowfile}
              setIncludeFlowfile={setIncludeFlowfile}
            />
          </div>
        )}
        {currentStep === INSTALL_STEP && (
          <div data-testid="setup-step-install">
            <SetupInstallProgress
              dbtLine={dbtLine}
              dbtVersion={chosenDbtVersions[dbtLine]}
              selectedAdapters={selectedAdapters}
              includeFlowfile={includeFlowfile}
              onRunningChange={setIsInstalling}
            />
          </div>
        )}
      </Box>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          pt: 2,
          flexShrink: 0,
        }}
      >
        {currentStep !== INSTALL_STEP && (
          <Button
            variant="outlined"
            data-testid="setup-skip-btn"
            onClick={finishSetup}
          >
            Skip Setup
          </Button>
        )}
        <Box sx={{ ml: 'auto', display: 'flex', gap: 1 }}>
          {currentStep === FLOWFILE_STEP && (
            <Button
              variant="outlined"
              data-testid="setup-back-btn"
              onClick={() => setCurrentStep(DBT_STEP)}
            >
              Back
            </Button>
          )}
          {currentStep === DBT_STEP && (
            <Button
              variant="contained"
              data-testid="setup-next-btn"
              onClick={() => setCurrentStep(FLOWFILE_STEP)}
            >
              Next
            </Button>
          )}
          {currentStep === FLOWFILE_STEP && (
            <Button
              variant="contained"
              data-testid="setup-install-btn"
              onClick={() => {
                setIsInstalling(true);
                setCurrentStep(INSTALL_STEP);
              }}
            >
              Install
            </Button>
          )}
          {currentStep === INSTALL_STEP && (
            <Button
              variant="contained"
              data-testid="setup-finish-btn"
              disabled={isInstalling}
              onClick={finishSetup}
            >
              Finish
            </Button>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default Setup;
