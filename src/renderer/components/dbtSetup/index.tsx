import React from 'react';
import {
  Box,
  Checkbox,
  FormControlLabel,
  Typography,
  LinearProgress,
  Button,
  Alert,
} from '@mui/material';
import { toast } from 'react-toastify';
import { useCli } from '../../hooks';
import { settingsServices } from '../../services';
import { SettingsType } from '../../../types/backend';
import { useInstallPython } from '../../controllers';

type AdapterSelectionProps = {
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
  installButton: React.ReactNode;
};

const AdapterSelection: React.FC<AdapterSelectionProps> = ({
  adapters,
  selectedAdapters,
  setSelectedAdapters,
  installButton,
}) => {
  return (
    <Box
      sx={{
        mt: 3,
        mb: 3,
        p: 2,
        bgcolor: 'background.paper',
        borderRadius: 1,
        border: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography variant="h6" gutterBottom>
        Select dbt™ Adapters
      </Typography>
      <Typography variant="body2" component="div">
        <ul>
          {adapters.map((adapter, index) => (
            <li key={adapter.name}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={selectedAdapters.includes(adapter.name)}
                    disabled={index === 0}
                    onChange={() => {
                      if (selectedAdapters.includes(adapter.name)) {
                        setSelectedAdapters(
                          selectedAdapters.filter((a) => a !== adapter.name),
                        );
                      } else {
                        setSelectedAdapters([
                          ...selectedAdapters,
                          adapter.name,
                        ]);
                      }
                    }}
                  />
                }
                label={
                  <Typography sx={{ fontSize: 12 }}>
                    {adapter.name}: {adapter.description}
                  </Typography>
                }
              />
            </li>
          ))}
        </ul>
        {installButton}
      </Typography>
    </Box>
  );
};

type Props = {
  settings: SettingsType;
  adapters: Array<{ name: string; description: string }>;
  selectedAdapters: string[];
  setSelectedAdapters: React.Dispatch<React.SetStateAction<string[]>>;
  onInstallComplete: (dbtPath: string) => void;
};

export const DbtSetup: React.FC<Props> = ({
  settings,
  selectedAdapters,
  onInstallComplete,
  adapters,
  setSelectedAdapters,
}) => {
  const { runCommand } = useCli();
  const installPython = useInstallPython();
  const [loading, setLoading] = React.useState(false);
  const [currentPkg, setCurrentPkg] = React.useState('');
  const [progress, setProgress] = React.useState(0);

  const handleInstall = async () => {
    setLoading(true);
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
          // eslint-disable-next-line no-await-in-loop
          await runCommand(`${python} -m pip install ${pkg}`);
        } catch {
          // continue
        }
      }

      setCurrentPkg('Locating dbt path...');
      setProgress(100);
      const dbtPath = await settingsServices.getDbtPath();
      onInstallComplete(dbtPath);
    } catch (error) {
      toast.error(
        `Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box>
      <Typography variant="body1">
        Before continuing, you need to set up dbt™ Core and the necessary
        adapters on your system.
      </Typography>
      {settings.pythonPath && settings.pythonVersion && (
        <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
          Python environment (version {settings.pythonVersion}) is already
          installed at: {settings.pythonPath}
        </Alert>
      )}
      <AdapterSelection
        adapters={adapters}
        selectedAdapters={selectedAdapters}
        setSelectedAdapters={setSelectedAdapters}
        installButton={
          loading ? (
            <>
              <Typography variant="body2">Installing: {currentPkg}</Typography>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{ mb: 1 }}
              />
            </>
          ) : (
            <Button
              variant="contained"
              onClick={handleInstall}
              data-testid="setup-install-btn"
            >
              Install
            </Button>
          )
        }
      />
    </Box>
  );
};
