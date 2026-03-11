import React from 'react';
import {
  TextField,
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  CircularProgress,
  Alert,
  IconButton,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  CloudOutlined,
  DeleteOutline,
  CloudDoneOutlined,
  Login,
  Visibility,
  VisibilityOff,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuthLogin, useValidateApiKey, useApiKey } from '../../controllers';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useApiKeySync } from '../../hooks/useApiKeySync';

export const CloudSettings: React.FC = () => {
  const { setCloudApiKey, deleteCloudApiKey } = useSecureStorage();

  // State for API key management
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [apiKeyError, setApiKeyError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [showApiKey, setShowApiKey] = React.useState(false);
  const [showCurrentApiKey, setShowCurrentApiKey] = React.useState(false);

  // Hooks
  const { data: currentApiKey } = useApiKey();
  const { mutateAsync: validateApiKey, isLoading: isValidating } =
    useValidateApiKey();
  const { mutate: login, isLoading: loginLoading } = useAuthLogin({
    onSuccess: () => {
      toast.success(
        'Login initiated! Please complete authentication in your browser.',
      );
    },
    onError: (error) => {
      toast.error(`Login failed: ${error.message || 'Unknown error'}`);
    },
  });

  // Subscribe to authentication events (OAuth login/logout)
  const { refreshAuthState } = useApiKeySync();

  const hasApiKey = !!currentApiKey;

  // Listen for API key changes (OAuth login) and clear input
  React.useEffect(() => {
    if (hasApiKey) {
      // API key was received (likely from OAuth), clear input
      setApiKeyInput('');
      setApiKeyError('');
    }
  }, [hasApiKey]);

  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(event.target.value);
    // Clear any existing error when user starts typing
    if (apiKeyError) {
      setApiKeyError('');
    }
  };

  const handleSaveApiKey = async () => {
    const apiKeyToSave = apiKeyInput.trim();

    if (!apiKeyToSave) {
      setApiKeyError('API key is required.');
      return;
    }

    if (apiKeyToSave.length < 16) {
      setApiKeyError('API key must be at least 16 characters.');
      return;
    }

    setIsSaving(true);
    setApiKeyError('');

    try {
      // Validate API key against server BEFORE saving
      const validation = await validateApiKey(apiKeyToSave);

      if (!validation.valid) {
        setApiKeyError(validation.error || 'Invalid API key');
        return;
      }

      // Only save if validation passes
      await setCloudApiKey(apiKeyToSave);

      // Refresh the API key query to get the updated value
      await refreshAuthState();

      setApiKeyInput('');

      toast.success('API key saved successfully');
    } catch {
      setApiKeyError('Failed to save API key. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setIsSaving(true);
    try {
      await deleteCloudApiKey();

      // Refresh the API key query
      await refreshAuthState();

      setApiKeyInput('');
      setApiKeyError('');

      toast.success('Cloud API key removed.');
    } catch {
      toast.error('Unable to remove the cloud API key.');
    } finally {
      setIsSaving(false);
    }
  };

  const getApiKeyHelperText = () => {
    if (apiKeyError) {
      return apiKeyError;
    }
    if (hasApiKey) {
      return 'To change your API key, first remove the current connection, then add a new one.';
    }
    return 'Enter your API key from Rosetta Cloud or use the OAuth login above.';
  };

  const canSaveApiKey =
    !isSaving &&
    !isValidating &&
    !hasApiKey && // Only allow saving when no API key exists
    apiKeyInput.trim().length >= 16 &&
    !apiKeyError;

  return (
    <Box maxWidth={800} width="100%">
      <Typography variant="h6" gutterBottom>
        Cloud Dashboard Connection
      </Typography>
      <Typography variant="body2" color="text.secondary" mb={3}>
        Connect to your Rosetta Cloud Dashboard to enable cloud features like
        project deployment and profile synchronization.
      </Typography>

      {/* OAuth Login Section - only show if no API key */}
      {!hasApiKey && (
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom>
            <strong>Recommended:</strong> Use OAuth login for the best
            experience
          </Typography>
          <Button
            variant="contained"
            onClick={() => login()}
            disabled={loginLoading}
            startIcon={
              loginLoading ? <CircularProgress size={16} /> : <Login />
            }
            sx={{ mt: 1 }}
          >
            {loginLoading ? 'Connecting...' : 'Connect with OAuth'}
          </Button>
        </Alert>
      )}

      {/* Connection Status */}
      {hasApiKey && (
        <Alert severity="success" sx={{ mb: 2 }}>
          ✅ Connected to Cloud Dashboard
        </Alert>
      )}

      {/* API Key Management Section */}
      <Card variant="outlined" sx={{ borderRadius: 1, borderColor: 'divider' }}>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <CloudOutlined color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              API Key Management
            </Typography>
          </Box>

          {/* Current API Key Display - only show when API key exists */}
          {hasApiKey && (
            <TextField
              label="Current API Key"
              type={showCurrentApiKey ? 'text' : 'password'}
              value={currentApiKey || ''}
              disabled
              fullWidth
              variant="outlined"
              sx={{
                mb: 2,
                '& .MuiOutlinedInput-root': {
                  height: '44px',
                  '& input': {
                    padding: '12px 14px',
                    fontSize: '13px',
                  },
                },
                '& .MuiInputLabel-root': {
                  fontSize: '13px',
                  '&.MuiInputLabel-shrunk': {
                    fontSize: '11px',
                  },
                },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip
                      title={
                        showCurrentApiKey ? 'Hide API key' : 'Show API key'
                      }
                    >
                      <IconButton
                        onClick={() => setShowCurrentApiKey(!showCurrentApiKey)}
                        edge="end"
                        size="small"
                        sx={{ padding: '4px' }}
                      >
                        {showCurrentApiKey ? (
                          <VisibilityOff fontSize="small" />
                        ) : (
                          <Visibility fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          )}

          {/* API Key Input - only show when no API key exists */}
          {!hasApiKey && (
            <TextField
              label="API Key"
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={handleApiKeyChange}
              error={!!apiKeyError}
              helperText={getApiKeyHelperText()}
              disabled={isSaving || isValidating}
              placeholder="Enter your API key"
              fullWidth
              variant="outlined"
              sx={{
                '& .MuiOutlinedInput-root': {
                  height: '44px',
                  '& input': {
                    padding: '12px 14px',
                    fontSize: '13px',
                  },
                },
                '& .MuiInputLabel-root': {
                  fontSize: '13px',
                  '&.MuiInputLabel-shrunk': {
                    fontSize: '11px',
                  },
                },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <Tooltip
                      title={showApiKey ? 'Hide API key' : 'Show API key'}
                    >
                      <IconButton
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        size="small"
                        sx={{ padding: '4px' }}
                      >
                        {showApiKey ? (
                          <VisibilityOff fontSize="small" />
                        ) : (
                          <Visibility fontSize="small" />
                        )}
                      </IconButton>
                    </Tooltip>
                  </InputAdornment>
                ),
              }}
            />
          )}

          {/* Helper text for existing API key */}
          {hasApiKey && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {getApiKeyHelperText()}
            </Typography>
          )}
        </CardContent>

        <CardActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
          <Button
            color="error"
            variant="outlined"
            onClick={handleRemoveApiKey}
            disabled={!hasApiKey || isSaving}
            startIcon={<DeleteOutline />}
          >
            Remove Connection
          </Button>

          {/* Save button - only show when no API key exists */}
          {!hasApiKey && (
            <Button
              variant="contained"
              onClick={handleSaveApiKey}
              disabled={!canSaveApiKey}
              startIcon={
                isSaving || isValidating ? (
                  <CircularProgress size={16} />
                ) : (
                  <CloudDoneOutlined />
                )
              }
            >
              {isValidating ? 'Validating...' : 'Save API Key'}
            </Button>
          )}
        </CardActions>
      </Card>
    </Box>
  );
};
