import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Alert,
  CircularProgress,
  IconButton,
  InputAdornment,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  CloudUploadOutlined,
  Close,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { usePushProjectToCloud } from '../../../controllers';
import { Project } from '../../../../types/backend';
import useSecureStorage from '../../../hooks/useSecureStorage';

interface PushToCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
}

export const PushToCloudModal: React.FC<PushToCloudModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const { getCloudApiKey } = useSecureStorage();
  const {
    mutateAsync: pushProject,
    isLoading: isPushing,
    reset: resetMutation,
  } = usePushProjectToCloud();

  const [title, setTitle] = React.useState('');
  const [gitUrl, setGitUrl] = React.useState('');
  const [gitBranch, setGitBranch] = React.useState('main');
  const [apiKey, setApiKey] = React.useState<string | null>(null);
  const [isLoadingKey, setIsLoadingKey] = React.useState(false);
  const [urlError, setUrlError] = React.useState('');
  const [titleError, setTitleError] = React.useState('');
  const [formError, setFormError] = React.useState('');
  const [githubUsername, setGithubUsername] = React.useState('');
  const [githubPassword, setGithubPassword] = React.useState('');
  const [showGithubPassword, setShowGithubPassword] = React.useState(false);

  const handleGitUrlChange = React.useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
      setGitUrl(value);
      if (urlError) {
        setUrlError('');
      }
    },
    [urlError],
  );

  const resetForm = React.useCallback(() => {
    setTitle(project?.name ?? '');
    setGitUrl('');
    setGitBranch('main');
    setUrlError('');
    setTitleError('');
    setFormError('');
    setApiKey(null);
    setGithubUsername('');
    setGithubPassword('');
    setShowGithubPassword(false);
  }, [project?.name]);

  React.useEffect(() => {
    let isCancelled = false;

    const loadApiKey = async () => {
      setIsLoadingKey(true);
      try {
        const key = await getCloudApiKey();
        if (!isCancelled) {
          setApiKey(key);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to load cloud API key:', error);
        toast.error('Unable to load the cloud API key.');
        if (!isCancelled) {
          setApiKey(null);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingKey(false);
        }
      }
    };

    if (isOpen) {
      resetForm();
      loadApiKey().catch((error) => {
        // eslint-disable-next-line no-console
        console.error('Unexpected error loading cloud API key:', error);
      });
    } else {
      resetMutation();
      setApiKey(null);
      setFormError('');
      setUrlError('');
      setTitleError('');
    }

    return () => {
      isCancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, resetForm, resetMutation]);

  const validateForm = () => {
    let isValid = true;
    const trimmedTitle = title.trim();
    const trimmedUrl = gitUrl.trim();
    const trimmedBranch = gitBranch.trim();

    if (!trimmedTitle) {
      setTitleError('Project name is required.');
      isValid = false;
    } else {
      setTitleError('');
    }

    if (!trimmedUrl) {
      setUrlError('Repository URL is required.');
      isValid = false;
    } else if (!/^https?:\/\//i.test(trimmedUrl)) {
      setUrlError('Repository URL must start with http:// or https://');
      isValid = false;
    } else if (!trimmedUrl.endsWith('.git')) {
      setUrlError('Repository URL should end with .git');
      isValid = false;
    } else {
      setUrlError('');
    }

    if (!trimmedBranch) {
      setGitBranch('main');
    }

    return isValid;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    if (!validateForm()) {
      return;
    }

    if (!apiKey) {
      setFormError(
        'Cloud API key is required. Configure it in Settings > General > Cloud Workspace.',
      );
      return;
    }

    if (!project?.id) {
      setFormError('Select a project to deploy.');
      return;
    }

    try {
      await pushProject({
        title: title.trim(),
        gitUrl: gitUrl.trim(),
        gitBranch: gitBranch.trim() || 'main',
        apiKey,
        githubUsername: githubUsername.trim() || undefined,
        githubPassword: githubPassword || undefined,
      });
      toast.success('Project deployed to cloud.');
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to deploy project to Rosetta Cloud.';
      setFormError(message);
      // eslint-disable-next-line no-console
      console.error('Failed to deploy project to cloud:', error);
      toast.error(
        'Unable to deploy project. Please review the form and try again.',
      );
    }
  };

  const disableSubmit =
    !project?.id ||
    isLoadingKey ||
    isPushing ||
    !title.trim() ||
    !gitUrl.trim() ||
    !!urlError ||
    !!titleError ||
    !apiKey;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isPushing) {
          onClose();
        }
      }}
      title="Deploy Project to Rosetta Cloud"
    >
      <form onSubmit={handleSubmit}>
        <Box display="flex" flexDirection="column" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Ensure a Rosetta Cloud API key is configured in Settings before
            deploying. Submissions use the workspace key stored securely on this
            device.
          </Typography>

          {isLoadingKey && (
            <Alert severity="info">Loading secure credentials…</Alert>
          )}

          {!isLoadingKey && !apiKey && (
            <Alert severity="warning">
              No cloud API key found. Add one in Settings → General → Cloud
              Workspace first.
            </Alert>
          )}

          {formError && <Alert severity="error">{formError}</Alert>}

          <TextField
            label="Project name"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            error={!!titleError}
            helperText={titleError || 'Displayed on Rosetta Cloud dashboards.'}
            fullWidth
            required
          />

          <TextField
            label="Git repository URL"
            value={gitUrl}
            onChange={handleGitUrlChange}
            error={!!urlError}
            helperText={
              urlError ||
              'Provide a HTTPS Git URL ending with .git (e.g., https://github.com/org/project.git).'
            }
          />

          <TextField
            label="Branch"
            value={gitBranch}
            onChange={(event) => setGitBranch(event.target.value)}
            helperText="Branch to deploy. Defaults to main."
            fullWidth
            InputProps={{ readOnly: true }}
          />

          <TextField
            label="GitHub username"
            value={githubUsername}
            onChange={(event) => setGithubUsername(event.target.value)}
            helperText="Optional. Leave blank to use repository defaults."
            fullWidth
          />

          <TextField
            label="GitHub password or token"
            type={showGithubPassword ? 'text' : 'password'}
            value={githubPassword}
            onChange={(event) => setGithubPassword(event.target.value)}
            helperText="Optional. Stored only for this submission."
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowGithubPassword((prev) => !prev)}
                    edge="end"
                    aria-label="Toggle GitHub credential visibility"
                  >
                    {showGithubPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Project ID"
            value={project?.id ?? 'No project selected'}
            helperText="Project identifier used for secure key lookup."
            fullWidth
            InputProps={{ readOnly: true }}
          />

          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              variant="contained"
              color="primary"
              onClick={onClose}
              disabled={isPushing}
              startIcon={<Close />}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={disableSubmit}
              startIcon={
                isPushing ? (
                  <CircularProgress size={18} />
                ) : (
                  <CloudUploadOutlined />
                )
              }
            >
              {isPushing ? 'Deploying…' : 'Deploy'}
            </Button>
          </Box>
        </Box>
      </form>
    </Modal>
  );
};
