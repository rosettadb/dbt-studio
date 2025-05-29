import React from 'react';
import {
  Alert,
  Typography,
  Box,
  TextField,
  Button,
  CircularProgress,
} from '@mui/material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import { useCreateVenv } from '../../controllers';

type Props = {
  settings: SettingsType;
};

export const PythonSetup: React.FC<Props> = ({ settings }) => {
  const [pathInput, setPathInput] = React.useState(settings.pythonBinary);
  const { mutate: createVenv, isLoading } = useCreateVenv({
    onSuccess: () => {
      toast.info('Virtual env created successfully!');
    },
  });

  if (settings.pythonPath && settings.pythonVersion) {
    return (
      <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
        Python environment (version {settings.pythonVersion}) is successfully
        installed at: {settings.pythonPath}
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        Step 1: Configure Python Venv
      </Typography>
      <Typography variant="body2" gutterBottom>
        Enter the path to your Python executable (default: integrated
        python3.10):
      </Typography>
      <Box>
        <TextField
          variant="outlined"
          fullWidth
          size="small"
          value={pathInput}
          onChange={(e) => setPathInput(e.target.value)}
          placeholder="/usr/bin/python3"
        />
        <Button
          variant="contained"
          onClick={() => createVenv()}
          style={{ marginTop: 10 }}
          disabled={isLoading || pathInput === ''}
          startIcon={
            isLoading ? <CircularProgress size={14} color="inherit" /> : null
          }
        >
          Create Venv
        </Button>
      </Box>
    </Box>
  );
};
