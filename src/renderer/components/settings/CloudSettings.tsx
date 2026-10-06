import React from 'react';
import {
  TextField,
  Button,
  Typography,
  CircularProgress,
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
  VpnKeyOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { useAuthLogin, useValidateApiKey, useApiKey } from '../../controllers';
import useSecureStorage from '../../hooks/useSecureStorage';
import { useApiKeySync } from '../../hooks/useApiKeySync';
import { SettingsRow, SettingsSection, SettingsStatus } from './SettingsLayout';

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

  const renderVisibilityToggle = (visible: boolean, onToggle: () => void) => (
    <InputAdornment position="end">
      <Tooltip title={visible ? 'Hide API key' : 'Show API key'}>
        <IconButton onClick={onToggle} edge="end" size="small">
          {visible ? (
            <VisibilityOff fontSize="small" />
          ) : (
            <Visibility fontSize="small" />
          )}
        </IconButton>
      </Tooltip>
    </InputAdornment>
  );

  return (
    <>
      <SettingsSection
        title="Cloud Dashboard Connection"
        icon={<CloudOutlined />}
        description="Enables project deployment and profile synchronization."
      >
        <SettingsRow
          label="Status"
          description={
            hasApiKey
              ? 'Connected to Cloud Dashboard'
              : 'Recommended: use OAuth login for the best experience'
          }
        >
          {hasApiKey ? (
            <>
              <SettingsStatus tone="success">Connected</SettingsStatus>
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={handleRemoveApiKey}
                disabled={isSaving}
                startIcon={<DeleteOutline />}
              >
                Remove Connection
              </Button>
            </>
          ) : (
            <Button
              size="small"
              variant="contained"
              onClick={() => login()}
              disabled={loginLoading}
              startIcon={
                loginLoading ? <CircularProgress size={14} /> : <Login />
              }
            >
              {loginLoading ? 'Connecting...' : 'Connect with OAuth'}
            </Button>
          )}
        </SettingsRow>
      </SettingsSection>

      <SettingsSection title="API Key Management" icon={<VpnKeyOutlined />}>
        {hasApiKey ? (
          <SettingsRow
            label="Current API Key"
            description={getApiKeyHelperText()}
          >
            <TextField
              size="small"
              type={showCurrentApiKey ? 'text' : 'password'}
              value={currentApiKey || ''}
              disabled
              sx={{ width: 280 }}
              InputProps={{
                endAdornment: renderVisibilityToggle(showCurrentApiKey, () =>
                  setShowCurrentApiKey(!showCurrentApiKey),
                ),
              }}
            />
          </SettingsRow>
        ) : (
          <SettingsRow
            label="API Key"
            description={
              <Typography
                variant="caption"
                color={apiKeyError ? 'error' : 'text.secondary'}
              >
                {getApiKeyHelperText()}
              </Typography>
            }
          >
            <TextField
              size="small"
              type={showApiKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={handleApiKeyChange}
              error={!!apiKeyError}
              disabled={isSaving || isValidating}
              placeholder="Enter your API key"
              sx={{ width: 280 }}
              InputProps={{
                endAdornment: renderVisibilityToggle(showApiKey, () =>
                  setShowApiKey(!showApiKey),
                ),
              }}
            />
            <Button
              size="small"
              variant="contained"
              onClick={handleSaveApiKey}
              disabled={!canSaveApiKey}
              startIcon={
                isSaving || isValidating ? (
                  <CircularProgress size={14} />
                ) : (
                  <CloudDoneOutlined />
                )
              }
            >
              {isValidating ? 'Validating...' : 'Save API Key'}
            </Button>
          </SettingsRow>
        )}
      </SettingsSection>
    </>
  );
};
