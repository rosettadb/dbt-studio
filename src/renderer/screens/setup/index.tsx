import React from 'react';
import { Box, Button } from '@mui/material';
import { toast } from 'react-toastify';
import { useGetSettings, useUpdateSettings } from '../../controllers';
import { Loader, FinishSetup, DbtSetup } from '../../components';
import { client } from '../../config/client';

const ADAPTERS = [
  { name: 'dbt-core', description: 'The core dbt™ package' },
  { name: 'dbt-postgres', description: 'Adapter for PostgreSQL databases' },
  { name: 'dbt-snowflake', description: 'Adapter for Snowflake databases' },
  { name: 'dbt-bigquery', description: 'Adapter for Google BigQuery' },
  { name: 'dbt-redshift', description: 'Adapter for Amazon Redshift' },
  { name: 'dbt-databricks', description: 'Adapter for Databricks' },
];

const Setup: React.FC = () => {
  const { data: settings, isLoading } = useGetSettings();
  const { mutate: updateSettings } = useUpdateSettings();
  const [isInitialized, setIsInitialized] = React.useState(false);
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [selectedAdapters, setSelectedAdapters] = React.useState<string[]>(
    ADAPTERS.map((a) => a.name),
  );

  const saveSetting = (name: string, value: string) => {
    if (settings) {
      updateSettings({ ...settings, [name]: value });
    }
  };

  const handleSkip = async () => {
    saveSetting('isSetup', 'true');
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
    <Box style={{ display: 'flex', flexDirection: 'column' }}>
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
        <DbtSetup
          settings={settings}
          adapters={ADAPTERS}
          selectedAdapters={selectedAdapters}
          setSelectedAdapters={setSelectedAdapters}
          onInstallComplete={(path) => {
            toast.info('Installation completed');
            saveSetting('dbtPath', path);
            setCurrentStep(currentStep + 1);
          }}
        />
      )}
      {currentStep === 1 && <FinishSetup settings={settings} />}
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        {currentStep > 0 && (
          <Button
            variant="outlined"
            disabled={currentStep === 0}
            onClick={() => setCurrentStep(currentStep - 1)}
          >
            Previous
          </Button>
        )}
        <Button
          variant="contained"
          disabled={currentStep === 0 && !settings.dbtPath}
          style={{ marginLeft: 'auto' }}
          onClick={() => {
            if (currentStep === 1) {
              handleSkip();
              return;
            }
            setCurrentStep(currentStep + 1);
          }}
        >
          {currentStep === 11 ? 'Finish' : 'Next'}
        </Button>
      </div>
    </Box>
  );
};

export default Setup;
