import React from 'react';
import {
  TextField,
  IconButton,
  Box,
  Button,
  Card,
  CardContent,
  CardActions,
  Typography,
  Tooltip,
  CircularProgress,
} from '@mui/material';
import {
  FolderOpen,
  Save,
  CloudOutlined,
  DeleteOutline,
  CloudDoneOutlined,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SettingsType } from '../../../types/backend';
import { InstallationSettings } from './InstallationSettings';
import { useGetSelectedProject, useUpdateSettings } from '../../controllers';
import useSecureStorage from '../../hooks/useSecureStorage';
import { ROSETTA_CLOUD_BASE_URL } from '../../../main/utils/constants';
import { DuckDBWorkspaceCard } from './DuckDBWorkspaceCard';

interface GeneralSettingsProps {
  settings: SettingsType;
  onSettingsChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onFilePicker: (
    name: keyof SettingsType,
    isDir: boolean,
    defaultPath?: string,
  ) => void;
}

export const GeneralSettings: React.FC<GeneralSettingsProps> = ({
  settings,
  onSettingsChange,
  onFilePicker,
}) => {
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    onSettingsChange(e);
  };

  const { data: selectedProject } = useGetSelectedProject();
  const { setCloudApiKey, getCloudApiKey, deleteCloudApiKey } =
    useSecureStorage();
  const { mutateAsync: updateSettings } = useUpdateSettings();

  const [workspaceUrl, setWorkspaceUrl] = React.useState(
    settings.cloudWorkspaceUrl,
  );
  const [lastSyncedAt, setLastSyncedAt] = React.useState(
    settings.cloudWorkspaceLastSyncedAt ?? '',
  );
  const [apiKeyInput, setApiKeyInput] = React.useState('');
  const [storedApiKey, setStoredApiKey] = React.useState('');
  const [apiKeyError, setApiKeyError] = React.useState('');
  const [metadataDirty, setMetadataDirty] = React.useState(false);
  const [apiKeyDirty, setApiKeyDirty] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isLoadingKey, setIsLoadingKey] = React.useState(false);

  const hasStoredApiKey = storedApiKey.length > 0;

  React.useEffect(() => {
    setWorkspaceUrl(settings.cloudWorkspaceUrl);
    setLastSyncedAt(settings.cloudWorkspaceLastSyncedAt ?? '');
    setMetadataDirty(false);
  }, [settings.cloudWorkspaceUrl, settings.cloudWorkspaceLastSyncedAt]);

  React.useEffect(() => {
    const loadKey = async () => {
      setIsLoadingKey(true);
      try {
        const key = await getCloudApiKey();
        setStoredApiKey(key ?? '');
        setApiKeyInput('');
        setApiKeyDirty(false);
        setApiKeyError('');
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load cloud API key:', error);
        toast.error('Unable to load the cloud API key.');
        setStoredApiKey('');
      } finally {
        setIsLoadingKey(false);
      }
    };
    loadKey();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formattedLastSynced = React.useMemo(() => {
    if (!lastSyncedAt) return '';
    try {
      return new Date(lastSyncedAt).toLocaleString();
    } catch (error) {
      return lastSyncedAt;
    }
  }, [lastSyncedAt]);

  const validateApiKey = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed && !hasStoredApiKey) {
      setApiKeyError('API key is required.');
      return false;
    }
    if (trimmed && trimmed.length < 16) {
      setApiKeyError('API key must be at least 16 characters.');
      return false;
    }
    setApiKeyError('');
    return true;
  };

  const handleApiKeyChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setApiKeyInput(event.target.value);
    setApiKeyDirty(true);
    validateApiKey(event.target.value);
  };

  const effectiveWorkspaceUrl = workspaceUrl || ROSETTA_CLOUD_BASE_URL;

  const handleSaveCloud = async () => {
    if ((apiKeyDirty || !hasStoredApiKey) && !validateApiKey(apiKeyInput)) {
      return;
    }

    const apiKeyToSet = apiKeyDirty ? apiKeyInput.trim() : storedApiKey;
    if (!apiKeyToSet) {
      setApiKeyError('API key is required.');
      return;
    }

    setIsSaving(true);
    try {
      if (apiKeyDirty || !hasStoredApiKey) {
        await setCloudApiKey(apiKeyToSet);
      }

      const syncedAt = new Date().toISOString();
      const metadata: SettingsType = {
        ...settings,
        cloudWorkspaceUrl: effectiveWorkspaceUrl,
        cloudWorkspaceLastSyncedAt: syncedAt,
      };

      await updateSettings(metadata);

      if (apiKeyDirty) {
        setStoredApiKey(apiKeyToSet);
        setApiKeyInput('');
        setApiKeyDirty(false);
      }

      setLastSyncedAt(syncedAt);
      setMetadataDirty(false);
      toast.success('Cloud workspace settings saved.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to save cloud workspace settings:', error);
      toast.error('Unable to save cloud workspace settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRemoveApiKey = async () => {
    setIsSaving(true);
    try {
      await deleteCloudApiKey();

      const metadata: SettingsType = {
        ...settings,
        cloudWorkspaceUrl: effectiveWorkspaceUrl,
        cloudWorkspaceLastSyncedAt: '',
      };

      await updateSettings(metadata);

      setStoredApiKey('');
      setApiKeyInput('');
      setApiKeyDirty(false);
      setLastSyncedAt('');
      toast.success('Cloud API key removed.');
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to remove cloud API key:', error);
      toast.error('Unable to remove the cloud API key.');
    } finally {
      setIsSaving(false);
    }
  };

  const canSaveCloud =
    !isSaving &&
    !isLoadingKey &&
    (apiKeyDirty || metadataDirty || !hasStoredApiKey) &&
    !apiKeyError &&
    (apiKeyDirty || hasStoredApiKey);

  return (
    <Box mt={3}>
      <Box
        mb={4}
        maxWidth={800}
        display="flex"
        alignItems="center"
        justifyItems="center"
        gap={2}
      >
        <TextField
          fullWidth
          label="Projects Directory"
          variant="outlined"
          id="projectsDirectory"
          name="projectsDirectory"
          value={settings.projectsDirectory}
          onChange={handleChange}
          slotProps={{
            input: {
              endAdornment: (
                <IconButton
                  onClick={() =>
                    onFilePicker(
                      'projectsDirectory',
                      true,
                      settings.projectsDirectory,
                    )
                  }
                  edge="end"
                >
                  <FolderOpen />
                </IconButton>
              ),
            },
          }}
        />
        <Box>
          <Button
            type="submit"
            color="primary"
            variant="contained"
            startIcon={<Save />}
            sx={{
              padding: '8px 24px',
              fontWeight: '500',
            }}
          >
            Save
          </Button>
        </Box>
      </Box>
      <Card
        variant="outlined"
        sx={{ maxWidth: 800, borderRadius: 2, borderColor: 'divider', mb: 4 }}
      >
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <CloudOutlined color="primary" />
            <Typography variant="h6" sx={{ m: 0 }}>
              Cloud Workspace
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" mb={3}>
            Paste the Rosetta Cloud API key generated at {` ${workspaceUrl} `}
            to link this project. Keys are stored securely using your operating
            system keychain.
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Rosetta Cloud URL"
              name="cloudWorkspaceUrl"
              value={workspaceUrl}
              onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                setWorkspaceUrl(event.target.value);
                setMetadataDirty(true);
                onSettingsChange(event);
              }}
            />
            <TextField
              label={hasStoredApiKey ? 'Replace API key' : 'API key'}
              type="password"
              value={apiKeyInput}
              onChange={handleApiKeyChange}
              error={!!apiKeyError}
              helperText={
                apiKeyError ||
                (hasStoredApiKey
                  ? 'Key already stored. Enter a new key to replace it.'
                  : 'Paste the API key provided by Rosetta Cloud.')
              }
              disabled={isLoadingKey}
            />
            <Box display="flex" gap={2} alignItems="center">
              <Tooltip title="Workspace update timestamp">
                <TextField
                  label="Last saved"
                  value={formattedLastSynced || 'Not saved yet'}
                  InputProps={{ readOnly: true }}
                  sx={{ flex: 1 }}
                />
              </Tooltip>
              <Tooltip title="Current project identifier">
                <TextField
                  label="Project ID"
                  value={selectedProject?.id ?? 'No project selected'}
                  InputProps={{ readOnly: true }}
                  sx={{ flex: 1 }}
                />
              </Tooltip>
            </Box>
          </Box>
        </CardContent>
        <CardActions sx={{ justifyContent: 'space-between', px: 3, pb: 3 }}>
          <Button
            color="error"
            variant="outlined"
            onClick={handleRemoveApiKey}
            disabled={!hasStoredApiKey || isSaving || isLoadingKey}
            startIcon={<DeleteOutline />}
          >
            Remove key
          </Button>
          <Box display="flex" alignItems="center" gap={2}>
            {(isSaving || isLoadingKey) && <CircularProgress size={20} />}
            <Button
              variant="contained"
              color="primary"
              onClick={handleSaveCloud}
              disabled={!canSaveCloud}
              startIcon={<CloudDoneOutlined />}
            >
              Save Cloud Settings
            </Button>
          </Box>
        </CardActions>
      </Card>
      <DuckDBWorkspaceCard />
      <InstallationSettings />
    </Box>
  );
};
