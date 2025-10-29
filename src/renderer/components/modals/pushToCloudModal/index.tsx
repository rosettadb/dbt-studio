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
  CloudUpload,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import {
  useGetLocalChanges,
  usePushProjectToCloud,
} from '../../../controllers';
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
  project: Project;
}

export const PushToCloudModal: React.FC<PushToCloudModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const { getCloudApiKey } = useSecureStorage();
  const { data: localChanges } = useGetLocalChanges(project.path);
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

  const isRunMode = React.useMemo(() => {
    return !!project?.externalId;
  }, [project]);

  // Environment variables state
  const [environmentVariables, setEnvironmentVariables] = React.useState<
    EnvironmentVariable[]
  >([]);
  const [newEnvKey, setNewEnvKey] = React.useState('');
  const [newEnvValue, setNewEnvValue] = React.useState('');

  // Project status
  const [hasExternalId, setHasExternalId] = React.useState(false);

  const hasLocalChanges = React.useMemo(() => {
    return (
      !!localChanges?.hasUntracked ||
      !!localChanges?.hasUncommitted ||
      !!localChanges?.hasUntracked
    );
  }, [localChanges]);

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
      const secrets = environmentVariables.reduce(
        (acc, env) => {
          acc[env.key] = env.value;
          return acc;
        },
        {} as Record<string, string>,
      );
      secrets.ROSETTA_GIT_USER = githubUsername.trim();
      secrets.ROSETTA_GIT_PASSWORD = githubPassword;
      await pushProject({
        id: project.id,
        title: title.trim(),
        gitUrl: gitUrl.trim(),
        gitBranch: gitBranch.trim() || 'main',
        githubUsername: githubUsername.trim() || undefined,
        githubPassword: githubPassword || undefined,
        secrets,
      });
      await toast.success('Project deployed to cloud.');
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Failed to run project to Rosetta Cloud.`;
      setFormError(message);
      toast.error(
        `Unable to run project. Please review the form and try again.`,
      );
    }
  };

  const disableSubmit = React.useMemo(() => {
    if (!project?.id || isLoadingKey || isPushing || !apiKey) {
      return true;
    }

    return !title.trim() || !gitUrl.trim() || !!urlError || !!titleError;
  }, [
    project?.id,
    isLoadingKey,
    isPushing,
    apiKey,
    hasExternalId,
    title,
    gitUrl,
    urlError,
    titleError,
  ]);

  const buttonIcon = React.useMemo(() => {
    if (isPushing) return <CircularProgress size={18} />;
    return <CloudUpload />;
  }, [isPushing]);

  const buttonText = React.useMemo(() => {
    if (isPushing) {
      return 'Running…';
    }
    return 'Run on Cloud';
  }, [isPushing]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isPushing) {
          onClose();
        }
      }}
      title="Run Project on Cloud"
    >
      <form onSubmit={handleSubmit}>
        <Box display="flex" flexDirection="column" gap={2}>
          {/* Mode Toggle */}
          <Box display="flex" alignItems="center" gap={2}>
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
            Run your deployed project on the cloud with custom environment
            variables.
          </Typography>

          {hasLocalChanges && (
            <Alert
              severity="warning"
              sx={{ display: 'flex', alignItems: 'center' }}
            >
              <Box>
                <Typography variant="body2" fontWeight="bold" gutterBottom>
                  Uncommitted Local Changes Detected
                </Typography>
                <Typography variant="body2">
                  Your project has{' '}
                  {localChanges?.untrackedCount
                    ? `${localChanges.untrackedCount} untracked, `
                    : ''}
                  {localChanges?.uncommittedCount
                    ? `${localChanges.uncommittedCount} uncommitted, `
                    : ''}
                  {localChanges?.hasUnpushed
                    ? `${localChanges.unpushedCount} unpushed `
                    : ''}
                  change(s). The cloud deployment will pull from the remote Git
                  repository and
                  <strong> will not include these local changes</strong>.
                </Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Please commit and push your changes before deploying to ensure
                  the cloud version matches your local environment.
                </Typography>
              </Box>
            </Alert>
          )}

          {formError && <Alert severity="error">{formError}</Alert>}

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
          {!isRunMode && (
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
          )}
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
