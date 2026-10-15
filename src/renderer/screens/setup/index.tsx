import React from 'react';
import {
  Box,
  Button,
  Step,
  StepContent,
  StepLabel,
  Stepper,
  Typography,
} from '@mui/material';
import { useUpdateSettings } from '../../controllers';
import {
  DBT_LINE_LABELS,
  DbtAdaptersChoice,
  DbtLine,
  DbtLineChoice,
  DbtVersionChoice,
  FlowfileChoice,
  SetupInstallProgress,
  versionsOfLine,
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

const CHOICES_STEP = 0;
const INSTALL_STEP = 1;
const STEP_COUNT = 2;

// The choices on page 1, made one after another in a vertical stepper.
const CHOICES = ['line', 'version', 'adapters', 'tools'] as const;
type Choice = (typeof CHOICES)[number];

const DONE_TITLES: Record<Choice, string> = {
  line: 'dbt version',
  version: 'Version',
  adapters: 'Adapters',
  tools: 'Optional tools',
};

const Setup: React.FC = () => {
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const [currentStep, setCurrentStep] = React.useState(CHOICES_STEP);
  // The open choice (CHOICES.length when all are done) and how many are done.
  const [openChoice, setOpenChoice] = React.useState(0);
  const [completedChoices, setCompletedChoices] = React.useState(0);
  const [dbtLine, setDbtLine] = React.useState<DbtLine | null>(null);
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
        // Stable only (the default), newest first. Nothing is pre-picked:
        // the person chooses the version themselves.
        const { versions } = await listDbtCoreVersions({ limit: 100 });
        setAvailableDbtVersions(versions.map((item) => item.version));
      } catch {
        // No list (e.g. offline): the version step offers "Latest" and the
        // install step looks the latest version up itself.
        setAvailableDbtVersions([]);
      }
    };
    loadDbtVersions();
  }, []);

  // Marks a choice done and opens the next unfinished one (or none).
  const completeChoice = (index: number) => {
    const completed = Math.max(completedChoices, index + 1);
    setCompletedChoices(completed);
    setOpenChoice(completed);
  };

  const pickDbtLine = (line: DbtLine) => {
    if (line === dbtLine) {
      completeChoice(0);
      return;
    }
    // A different line starts again with no version picked.
    setDbtLine(line);
    setChosenDbtVersions((previous) => ({ ...previous, [line]: null }));
    setCompletedChoices(1);
    setOpenChoice(1);
  };

  const chosenVersion = dbtLine ? chosenDbtVersions[dbtLine] : null;
  const adapterCount = ADAPTERS.length - 1;
  const selectedAdapterCount = selectedAdapters.length - 1;

  let versionSummary = 'Latest';
  if (dbtLine && chosenVersion) {
    versionSummary =
      chosenVersion === versionsOfLine(availableDbtVersions, dbtLine)[0]
        ? `${chosenVersion} (latest)`
        : chosenVersion;
  }
  let adaptersSummary = `${selectedAdapterCount} of ${adapterCount} adapters`;
  if (dbtLine === 'v2') adaptersSummary = '5 built-in adapters';
  else if (selectedAdapterCount === adapterCount)
    adaptersSummary = `All ${adapterCount} adapters`;

  const choiceTitles: Record<Choice, string> = {
    line: 'Which dbt™ version would you like to install?',
    version: dbtLine
      ? `Which version of ${DBT_LINE_LABELS[dbtLine]}?`
      : 'Version',
    adapters: 'Adapters',
    tools: 'Optional tools',
  };
  const choiceSummaries: Record<Choice, string> = {
    line: dbtLine ? DBT_LINE_LABELS[dbtLine] : '',
    version: versionSummary,
    adapters: adaptersSummary,
    tools: includeFlowfile ? 'Flowfile' : 'None',
  };

  const renderChoice = (choice: Choice) => {
    if (choice === 'line') {
      return <DbtLineChoice dbtLine={dbtLine} onPick={pickDbtLine} />;
    }
    if (!dbtLine) return null;
    if (choice === 'version') {
      return (
        <DbtVersionChoice
          dbtLine={dbtLine}
          availableVersions={availableDbtVersions}
          chosenVersion={chosenVersion}
          onPick={(version) => {
            setChosenDbtVersions((previous) => ({
              ...previous,
              [dbtLine]: version,
            }));
            completeChoice(1);
          }}
        />
      );
    }
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
        {choice === 'adapters' ? (
          <DbtAdaptersChoice
            dbtLine={dbtLine}
            adapters={ADAPTERS}
            selectedAdapters={selectedAdapters}
            setSelectedAdapters={setSelectedAdapters}
          />
        ) : (
          <FlowfileChoice
            includeFlowfile={includeFlowfile}
            setIncludeFlowfile={setIncludeFlowfile}
          />
        )}
        <Box>
          <Button
            variant="outlined"
            size="small"
            data-testid={`setup-continue-${choice}`}
            onClick={() => completeChoice(CHOICES.indexOf(choice))}
          >
            Continue
          </Button>
        </Box>
      </Box>
    );
  };

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
          Rosetta Studio - Setup
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
        {currentStep === CHOICES_STEP && (
          <Box data-testid="setup-step-cli">
            <Stepper activeStep={openChoice} orientation="vertical">
              {CHOICES.map((choice, index) => {
                const isDone = index < completedChoices && index !== openChoice;
                return (
                  <Step
                    key={choice}
                    completed={isDone}
                    data-testid={`setup-choice-${choice}`}
                  >
                    <StepLabel
                      optional={
                        isDone && (
                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                            }}
                          >
                            <Typography
                              variant="body2"
                              color="text.secondary"
                              data-testid={`setup-summary-${choice}`}
                            >
                              {choiceSummaries[choice]}
                            </Typography>
                            <Button
                              size="small"
                              onClick={() => setOpenChoice(index)}
                              data-testid={`setup-change-${choice}`}
                              sx={{ minWidth: 0, p: 0, textTransform: 'none' }}
                            >
                              Change
                            </Button>
                          </Box>
                        )
                      }
                    >
                      <Typography sx={{ fontSize: 14, fontWeight: 500 }}>
                        {index === openChoice
                          ? choiceTitles[choice]
                          : DONE_TITLES[choice]}
                      </Typography>
                    </StepLabel>
                    <StepContent>{renderChoice(choice)}</StepContent>
                  </Step>
                );
              })}
            </Stepper>
          </Box>
        )}
        {currentStep === INSTALL_STEP && dbtLine && (
          <div data-testid="setup-step-install">
            <SetupInstallProgress
              dbtLine={dbtLine}
              dbtVersion={chosenVersion}
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
          {currentStep === CHOICES_STEP && (
            <Button
              variant="contained"
              data-testid="setup-install-btn"
              disabled={completedChoices < CHOICES.length}
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
