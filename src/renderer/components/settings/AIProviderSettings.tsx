import React from 'react';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { TextField, Button, IconButton, InputAdornment } from '@mui/material';
import { toast } from 'react-toastify';
import {
  setOpenAIKey,
  getOpenAIKey,
  deleteOpenAIKey,
} from '../../services/settings.services';
import { AppContext } from '../../context';

export const AIProviderSettings: React.FC = () => {
  const { setIsAiProviderSet } = React.useContext(AppContext);
  const [apiKey, setApiKey] = React.useState('');
  const [showApiKey, setShowApiKey] = React.useState(false);

  React.useEffect(() => {
    const fetchApiKey = async () => {
      try {
        const storedKey = await getOpenAIKey();
        if (storedKey) setApiKey(storedKey);
      } catch (error) {
        toast.error('Failed to fetch API Key. Please try again.');
      }
    };
    fetchApiKey();
  }, []);

  const handleSave = async () => {
    if (!apiKey) {
      toast.error('API Key cannot be empty.');
      return;
    }
    try {
      await setOpenAIKey(apiKey);
      setIsAiProviderSet(true);
      toast.success('API Key saved successfully!');
    } catch (error) {
      toast.error('Failed to save API Key. Please try again.');
    }
  };

  const handleRemove = async () => {
    try {
      await deleteOpenAIKey(); // Use the delete method for removing the API key
      setApiKey(''); // Clear the local state
      setIsAiProviderSet(false); // Update the context state
      toast.success('API Key removed successfully!');
    } catch (error) {
      toast.error('Failed to remove API Key. Please try again.');
    }
  };

  const toggleShowApiKey = () => {
    setShowApiKey((prev) => !prev);
  };

  return (
    <div>
      <TextField
        fullWidth
        label="OpenAI API Key"
        variant="outlined"
        type={showApiKey ? 'text' : 'password'}
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        sx={{ mb: 2 }}
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={toggleShowApiKey} edge="end">
                {showApiKey ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <Button
        variant="contained"
        color="primary"
        onClick={handleSave}
        sx={{ mr: 2 }}
      >
        Save API Key
      </Button>
      <Button variant="outlined" color="secondary" onClick={handleRemove}>
        Remove API Key
      </Button>
    </div>
  );
};
