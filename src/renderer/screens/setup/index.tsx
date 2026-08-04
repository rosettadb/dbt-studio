import React from 'react';
import { Box, Button } from '@mui/material';
import { toast } from 'react-toastify';
import { useGetSettings, useUpdateSettings } from '../../controllers';
import { Loader, FinishSetup, DbtSetup } from '../../components';
import { client } from '../../config/client';
import { DBT_ADAPTER_PACKAGE_DEFINITIONS } from '../../../shared/dbtAdapterDefinitions';

const Setup: React.FC = () => {
  const { data: settings, isLoading } = useGetSettings();
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [selectedAdapters, setSelectedAdapters] = React.useState<string[]>(
    DBT_ADAPTER_PACKAGE_DEFINITIONS.map((a) => a.name),
  );

  const saveSetting = (name: string, value: string) => {
    if (settings) {
      updateSettings({ ...settings, [name]: value });
    }
  };

  const handleSkip = async () => {
    if (settings) {
      await updateSettings({ ...settings, isSetup: 'true' });
    }
    await client.get('windows:closeSetup');
  };

  React.useEffect(() => {
    if (settings && !isInitialized) {
      if (settings.pythonPath && settings.pythonPath !== '') {
        if (settings.dbtPath && settings.dbtPath !== '') {
          setCurrentStep(1);
        } else {
          setCurrentStep(0);
        }
      }
      setIsInitialized(true);
    }
  }, [settings]);

  if (isLoading) return <Loader />;
  if (!settings) return null;

  return (
    <Box
      style={{ display: 'flex', flexDirection: 'column' }}
      data-testid="setup-wizard"
    >
      <h2
        style={{
          marginTop: -16,
          height: 40,
          width: '100%',
          borderBottom: '1px solid',
        }}
      >
        Rosetta dbt™ Studio - Setup
      </h2>
      {currentStep === 0 && (
        <div data-testid="setup-step-cli" style={{ width: '100%' }}>
          <DbtSetup
            settings={settings}
            adapters={DBT_ADAPTER_PACKAGE_DEFINITIONS}
            selectedAdapters={selectedAdapters}
            setSelectedAdapters={setSelectedAdapters}
            onInstallComplete={(path) => {
              toast.info('Installation completed');
              saveSetting('dbtPath', path);
              setCurrentStep(currentStep + 1);
            }}
          />
        </div>
      )}
      {currentStep === 1 && (
        <div data-testid="setup-step-complete" style={{ width: '100%' }}>
          <FinishSetup settings={settings} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          variant="outlined"
          data-testid="setup-skip-btn"
          onClick={handleSkip}
        >
          Skip Setup
        </Button>
        <Button
          variant="contained"
          disabled={currentStep === 0 && !settings.dbtPath}
          style={{ marginLeft: 'auto' }}
          data-testid={
            currentStep === 1 ? 'setup-finish-btn' : 'setup-next-btn'
          }
          onClick={() => {
            if (currentStep === 1) {
              handleSkip();
              return;
            }
            setCurrentStep(currentStep + 1);
          }}
        >
          {currentStep === 1 ? 'Finish' : 'Next'}
        </Button>
      </div>
    </Box>
  );
};

export default Setup;
