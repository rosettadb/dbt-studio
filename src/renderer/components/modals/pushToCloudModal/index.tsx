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
  Chip,
  Divider,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Close,
  Add,
  Delete,
  ExpandMore,
  PlayArrow,
  CloudUpload,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { usePushProjectToCloud } from '../../../controllers';
import { Project } from '../../../../types/backend';
import useSecureStorage from '../../../hooks/useSecureStorage';

interface EnvironmentVariable {
  key: string;
  value: string;
  id: string;
}

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

  // Form mode state
  const [isRunMode, setIsRunMode] = React.useState(false);

  // Existing project deployment fields
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

  // Environment variables state
  const [environmentVariables, setEnvironmentVariables] = React.useState<
    EnvironmentVariable[]
  >([]);
  const [newEnvKey, setNewEnvKey] = React.useState('');
  const [newEnvValue, setNewEnvValue] = React.useState('');

  // Project status
  const [hasExternalId, setHasExternalId] = React.useState(false);

  const handleGitUrlChange = React.useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
      setGitUrl(value);
      if (urlError) {
        setUrlError('');
      }
    },
    [urlError],
  );

  // Environment variables helpers
  const addEnvironmentVariable = React.useCallback(() => {
    if (!newEnvKey.trim() || !newEnvValue.trim()) {
      toast.error('Both key and value are required for environment variables');
      return;
    }

    const exists = environmentVariables.some(
      (env) => env.key === newEnvKey.trim(),
    );
    if (exists) {
      toast.error('Environment variable key already exists');
      return;
    }

    const newEnv: EnvironmentVariable = {
      id: Date.now().toString(),
      key: newEnvKey.trim(),
      value: newEnvValue.trim(),
    };

    setEnvironmentVariables((prev) => [...prev, newEnv]);
    setNewEnvKey('');
    setNewEnvValue('');
  }, [newEnvKey, newEnvValue, environmentVariables]);

  const removeEnvironmentVariable = React.useCallback((id: string) => {
    setEnvironmentVariables((prev) => prev.filter((env) => env.id !== id));
  }, []);

  const updateEnvironmentVariable = React.useCallback(
    (id: string, key: string, value: string) => {
      setEnvironmentVariables((prev) =>
        prev.map((env) => (env.id === id ? { ...env, key, value } : env)),
      );
    },
    [],
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
    setEnvironmentVariables([]);
    setNewEnvKey('');
    setNewEnvValue('');
    setIsRunMode(!!project?.externalId);
    setHasExternalId(!!project?.externalId);
  }, [project?.name, project?.externalId]);

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

    if (isRunMode) {
      // For run mode, we only need the project to have an external ID
      if (!hasExternalId) {
        setFormError(
          'Project must be deployed to cloud before running. Switch to Deploy mode first.',
        );
        isValid = false;
      }
      return isValid;
    }

    // For deploy mode, validate all deployment fields
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
      if (isRunMode) {
        // Handle run on cloud with environment variables
        const envVars = environmentVariables.reduce(
          (acc, env) => {
            acc[env.key] = env.value;
            return acc;
          },
          {} as Record<string, string>,
        );

        // TODO: Implement run project on cloud API call
        // await runProjectOnCloud({
        //   projectId: project.externalId,
        //   environmentVariables: envVars,
        //   apiKey,
        // });

        toast.success('Project run initiated on cloud.');
        // eslint-disable-next-line no-console
        console.log('Run project with env vars:', envVars);
      } else {
        // Handle deploy to cloud
        await pushProject({
          id: project.id,
          title: title.trim(),
          gitUrl: gitUrl.trim(),
          gitBranch: gitBranch.trim() || 'main',
          githubUsername: githubUsername.trim() || undefined,
          githubPassword: githubPassword || undefined,
          secrets: {},
        });
        toast.success('Project deployed to cloud.');
      }
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${isRunMode ? 'run' : 'deploy'} project to Rosetta Cloud.`;
      setFormError(message);
      // eslint-disable-next-line no-console
      console.error(
        `Failed to ${isRunMode ? 'run' : 'deploy'} project to cloud:`,
        error,
      );
      toast.error(
        `Unable to ${isRunMode ? 'run' : 'deploy'} project. Please review the form and try again.`,
      );
    }
  };

  const disableSubmit = React.useMemo(() => {
    if (!project?.id || isLoadingKey || isPushing || !apiKey) {
      return true;
    }

    if (isRunMode) {
      return !hasExternalId;
    }

    return !title.trim() || !gitUrl.trim() || !!urlError || !!titleError;
  }, [
    project?.id,
    isLoadingKey,
    isPushing,
    apiKey,
    isRunMode,
    hasExternalId,
    title,
    gitUrl,
    urlError,
    titleError,
  ]);

  const buttonIcon = React.useMemo(() => {
    if (isPushing) return <CircularProgress size={18} />;
    if (isRunMode) return <PlayArrow />;
    return <CloudUpload />;
  }, [isPushing, isRunMode]);

  const buttonText = React.useMemo(() => {
    if (isPushing) {
      return isRunMode ? 'Running…' : 'Deploying…';
    }
    return isRunMode ? 'Run on Cloud' : 'Deploy to Cloud';
  }, [isPushing, isRunMode]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isPushing) {
          onClose();
        }
      }}
      title={
        isRunMode ? 'Run Project on Cloud' : 'Deploy Project to Rosetta Cloud'
      }
    >
      <form onSubmit={handleSubmit}>
        <Box display="flex" flexDirection="column" gap={2}>
          {/* Mode Toggle */}
          <Box display="flex" alignItems="center" gap={2}>
            <FormControlLabel
              control={
                <Switch
                  checked={isRunMode}
                  onChange={(e) => setIsRunMode(e.target.checked)}
                  disabled={!hasExternalId}
                />
              }
              label={isRunMode ? 'Run Mode' : 'Deploy Mode'}
            />
            {hasExternalId && (
              <Chip
                label="Already deployed"
                color="success"
                size="small"
                variant="outlined"
              />
            )}
            {!hasExternalId && (
              <Chip
                label="Not deployed"
                color="warning"
                size="small"
                variant="outlined"
              />
            )}
          </Box>

          <Typography variant="body2" color="text.secondary">
            {isRunMode
              ? 'Run your deployed project on the cloud with custom environment variables.'
              : 'Deploy your project to Rosetta Cloud. Ensure a Cloud API key is configured in Settings.'}
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

          {!hasExternalId && !isRunMode && (
            <Alert severity="info">
              This project hasn&apos;t been deployed to cloud yet. Use Deploy
              mode to upload it first.
            </Alert>
          )}

          {/* Deploy Mode Fields */}
          {!isRunMode && (
            <>
              <TextField
                label="Project name"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                error={!!titleError}
                helperText={
                  titleError || 'Displayed on Rosetta Cloud dashboards.'
                }
                fullWidth
                required
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                }}
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
                fullWidth
                required
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                }}
              />

              <TextField
                label="Branch"
                value={gitBranch}
                onChange={(event) => setGitBranch(event.target.value)}
                helperText="Branch to deploy. Defaults to main."
                fullWidth
                InputProps={{ readOnly: true }}
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                }}
              />

              <TextField
                label="GitHub username"
                value={githubUsername}
                onChange={(event) => setGithubUsername(event.target.value)}
                helperText="Optional. Leave blank to use repository defaults."
                fullWidth
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                }}
              />

              <TextField
                label="GitHub password or token"
                type={showGithubPassword ? 'text' : 'password'}
                value={githubPassword}
                onChange={(event) => setGithubPassword(event.target.value)}
                helperText="Optional. Stored only for this submission."
                fullWidth
                sx={{
                  '& .MuiInputBase-input': {
                    textAlign: 'left',
                  },
                }}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowGithubPassword((prev) => !prev)}
                        edge="end"
                        aria-label="Toggle GitHub credential visibility"
                      >
                        {showGithubPassword ? (
                          <VisibilityOff />
                        ) : (
                          <Visibility />
                        )}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </>
          )}

          {/* Environment Variables Section (for both modes) */}
          <Accordion
            defaultExpanded={isRunMode}
            sx={{
              borderRadius: 2,
              '&:before': {
                display: 'none',
              },
              boxShadow: 1,
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMore />}
              sx={{
                borderRadius: 2,
                '&.Mui-expanded': {
                  borderBottomLeftRadius: 0,
                  borderBottomRightRadius: 0,
                },
              }}
            >
              <Typography variant="h6">
                Environment Variables{' '}
                {environmentVariables.length > 0 &&
                  `(${environmentVariables.length})`}
              </Typography>
            </AccordionSummary>
            <AccordionDetails
              sx={{
                borderBottomLeftRadius: 2,
                borderBottomRightRadius: 2,
              }}
            >
              <Box display="flex" flexDirection="column" gap={2}>
                <Typography variant="body2" color="text.secondary">
                  Add environment variables that will be available during
                  project execution.
                </Typography>

                {/* Add new environment variable */}
                <Box display="flex" gap={1} alignItems="center">
                  <TextField
                    label="Key"
                    value={newEnvKey}
                    onChange={(e) => setNewEnvKey(e.target.value)}
                    size="small"
                    placeholder="e.g., DBT_PROFILES_DIR"
                    sx={{
                      flex: 1,
                      '& .MuiInputBase-input': {
                        textAlign: 'left',
                      },
                    }}
                  />
                  <TextField
                    label="Value"
                    value={newEnvValue}
                    onChange={(e) => setNewEnvValue(e.target.value)}
                    size="small"
                    placeholder="e.g., /app/profiles"
                    sx={{
                      flex: 2,
                      '& .MuiInputBase-input': {
                        textAlign: 'left',
                      },
                    }}
                  />
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={addEnvironmentVariable}
                    startIcon={<Add />}
                    disabled={!newEnvKey.trim() || !newEnvValue.trim()}
                    sx={{ minWidth: 'auto', px: 2 }}
                  >
                    Add
                  </Button>
                </Box>

                {/* Environment variables list */}
                {environmentVariables.length > 0 && (
                  <Box display="flex" flexDirection="column" gap={1}>
                    <Divider sx={{ my: 1 }} />
                    {environmentVariables.map((env) => (
                      <Box
                        key={env.id}
                        display="flex"
                        gap={1}
                        alignItems="center"
                        sx={{
                          p: 1,
                          borderRadius: 1,
                          bgcolor: 'action.hover',
                        }}
                      >
                        <TextField
                          value={env.key}
                          onChange={(e) =>
                            updateEnvironmentVariable(
                              env.id,
                              e.target.value,
                              env.value,
                            )
                          }
                          size="small"
                          variant="outlined"
                          sx={{
                            flex: 1,
                            '& .MuiInputBase-input': {
                              textAlign: 'left',
                            },
                          }}
                        />
                        <TextField
                          value={env.value}
                          onChange={(e) =>
                            updateEnvironmentVariable(
                              env.id,
                              env.key,
                              e.target.value,
                            )
                          }
                          size="small"
                          variant="outlined"
                          sx={{
                            flex: 2,
                            '& .MuiInputBase-input': {
                              textAlign: 'left',
                            },
                          }}
                        />
                        <IconButton
                          size="small"
                          onClick={() => removeEnvironmentVariable(env.id)}
                          color="error"
                          sx={{
                            minWidth: 'auto',
                            '&:hover': {
                              bgcolor: 'error.light',
                              color: 'error.contrastText',
                            },
                          }}
                        >
                          <Delete />
                        </IconButton>
                      </Box>
                    ))}
                  </Box>
                )}
              </Box>
            </AccordionDetails>
          </Accordion>

          <Box display="flex" justifyContent="flex-end" gap={2}>
            <Button
              variant="outlined"
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
              startIcon={buttonIcon}
            >
              {buttonText}
            </Button>
          </Box>
        </Box>
      </form>
    </Modal>
  );
};
