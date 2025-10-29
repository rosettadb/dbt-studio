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
  Paper,
  Stack,
  useTheme,
  alpha,
} from '@mui/material';
import {
  Visibility,
  VisibilityOff,
  Close,
  Delete,
  ExpandMore,
  CloudUpload,
  Lock,
  Key,
  AddOutlined,
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

const RESERVED_KEYS = ['ROSETTA_GIT_USER', 'ROSETTA_GIT_PASSWORD'];

export const PushToCloudModal: React.FC<PushToCloudModalProps> = ({
  isOpen,
  onClose,
  project,
}) => {
  const theme = useTheme();
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
      !!localChanges?.hasUnpushed
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
    const trimmedKey = newEnvKey.trim().toUpperCase();
    const trimmedValue = newEnvValue.trim();

    if (!trimmedKey || !trimmedValue) {
      toast.error('Both key and value are required for environment variables');
      return;
    }

    // Check if it's a reserved key
    if (RESERVED_KEYS.includes(trimmedKey)) {
      toast.error(
        `${trimmedKey} is a reserved key. Please use the dedicated fields above.`,
      );
      return;
    }

    const exists = environmentVariables.some((env) => env.key === trimmedKey);
    if (exists) {
      toast.error('Environment variable key already exists');
      return;
    }

    const newEnv: EnvironmentVariable = {
      id: Date.now().toString(),
      key: trimmedKey,
      value: trimmedValue,
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
      const uppercaseKey = key.toUpperCase();

      // Prevent updating to reserved keys
      if (RESERVED_KEYS.includes(uppercaseKey)) {
        toast.error(
          `${uppercaseKey} is a reserved key. Please use the dedicated fields.`,
        );
        return;
      }

      // Check for duplicates (excluding current item)
      const exists = environmentVariables.some(
        (env) => env.key === uppercaseKey && env.id !== id,
      );
      if (exists) {
        toast.error('Environment variable key already exists');
        return;
      }

      setEnvironmentVariables((prev) =>
        prev.map((env) =>
          env.id === id ? { ...env, key: uppercaseKey, value } : env,
        ),
      );
    },
    [environmentVariables],
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
        <Stack spacing={3}>
          {/* Status Badge */}
          <Box display="flex" alignItems="center" gap={1.5}>
            {hasExternalId ? (
              <Chip
                icon={<CloudUpload sx={{ fontSize: 16 }} />}
                label="Already Deployed"
                color="success"
                sx={{
                  fontWeight: 600,
                  px: 0.5,
                  bgcolor: alpha(theme.palette.success.main, 0.1),
                  color: 'success.main',
                  border: `1px solid ${alpha(theme.palette.success.main, 0.3)}`,
                }}
              />
            ) : (
              <Chip
                icon={<CloudUpload sx={{ fontSize: 16 }} />}
                label="Not Deployed"
                color="warning"
                sx={{
                  fontWeight: 600,
                  px: 0.5,
                  bgcolor: alpha(theme.palette.warning.main, 0.1),
                  color: 'warning.main',
                  border: `1px solid ${alpha(theme.palette.warning.main, 0.3)}`,
                }}
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
              sx={{
                borderRadius: 2,
                bgcolor: alpha(theme.palette.warning.main, 0.05),
                border: `1px solid ${alpha(theme.palette.warning.main, 0.2)}`,
                '& .MuiAlert-icon': {
                  color: 'warning.main',
                },
              }}
            >
              <Typography variant="body2" fontWeight="600" gutterBottom>
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
            </Alert>
          )}

          {/* Form Error */}
          {formError && (
            <Alert
              severity="error"
              sx={{
                borderRadius: 2,
                bgcolor: alpha(theme.palette.error.main, 0.05),
                border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
              }}
            >
              {formError}
            </Alert>
          )}

          {/* Deployment Fields */}
          {!isRunMode && (
            <Stack spacing={2.5}>
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
                  '& .MuiOutlinedInput-root': {
                    bgcolor: alpha(
                      theme.palette.background.default,
                      theme.palette.mode === 'dark' ? 0.4 : 0.5,
                    ),
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
                  '& .MuiOutlinedInput-root': {
                    bgcolor: alpha(
                      theme.palette.background.default,
                      theme.palette.mode === 'dark' ? 0.4 : 0.5,
                    ),
                  },
                }}
              />

              <TextField
                label="Branch"
                value={gitBranch}
                onChange={(event) => setGitBranch(event.target.value)}
                helperText="Branch to deploy. Defaults to main."
                fullWidth
                sx={{
                  '& .MuiOutlinedInput-root': {
                    bgcolor: alpha(
                      theme.palette.background.default,
                      theme.palette.mode === 'dark' ? 0.4 : 0.5,
                    ),
                  },
                }}
              />
              <Paper
                elevation={0}
                sx={{
                  p: 2.5,
                  borderRadius: 2,
                  bgcolor: alpha(
                    theme.palette.primary.main,
                    theme.palette.mode === 'dark' ? 0.08 : 0.04,
                  ),
                  border: `1px solid ${alpha(theme.palette.primary.main, 0.15)}`,
                }}
              >
                <Stack spacing={2}>
                  <Box display="flex" alignItems="center" gap={1}>
                    <Lock
                      sx={{
                        fontSize: 18,
                        color: 'primary.main',
                      }}
                    />
                    <Typography variant="subtitle2" fontWeight="600">
                      Git Credentials (Reserved)
                    </Typography>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    These credentials are stored as ROSETTA_GIT_USER and
                    ROSETTA_GIT_PASSWORD environment variables.
                  </Typography>

                  <TextField
                    label="GitHub username"
                    value={githubUsername}
                    onChange={(event) => setGithubUsername(event.target.value)}
                    helperText="Optional. Leave blank to use repository defaults."
                    fullWidth
                    sx={{
                      '& .MuiOutlinedInput-root': {
                        bgcolor: theme.palette.background.paper,
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
                      '& .MuiOutlinedInput-root': {
                        bgcolor: theme.palette.background.paper,
                      },
                    }}
                    slotProps={{
                      input: {
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() =>
                                setShowGithubPassword((prev) => !prev)
                              }
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
                      },
                    }}
                  />
                </Stack>
              </Paper>
            </Stack>
          )}
          {!isRunMode && (
            <Accordion
              defaultExpanded={isRunMode}
              sx={{
                borderRadius: 2,
                border: `1px solid ${theme.palette.divider}`,
                bgcolor: alpha(
                  theme.palette.background.default,
                  theme.palette.mode === 'dark' ? 0.3 : 0.5,
                ),
                '&:before': {
                  display: 'none',
                },
                boxShadow: 'none',
              }}
            >
              <AccordionSummary
                expandIcon={<ExpandMore />}
                sx={{
                  borderRadius: 2,
                  minHeight: 56,
                  '&.Mui-expanded': {
                    minHeight: 56,
                    borderBottomLeftRadius: 0,
                    borderBottomRightRadius: 0,
                    borderBottom: `1px solid ${theme.palette.divider}`,
                  },
                  '& .MuiAccordionSummary-content': {
                    alignItems: 'center',
                    gap: 1,
                  },
                }}
              >
                <Key sx={{ fontSize: 20, color: 'text.secondary' }} />
                <Typography variant="subtitle1" fontWeight="600">
                  Environment Variables
                </Typography>
                {environmentVariables.length > 0 && (
                  <Chip
                    label={environmentVariables.length}
                    sx={{
                      height: 22,
                      fontSize: '0.75rem',
                      bgcolor: alpha(theme.palette.primary.main, 0.1),
                      color: 'primary.main',
                      fontWeight: 600,
                    }}
                  />
                )}
              </AccordionSummary>
              <AccordionDetails
                sx={{
                  pt: 2.5,
                  pb: 2,
                  borderBottomLeftRadius: 2,
                  borderBottomRightRadius: 2,
                }}
              >
                <Stack spacing={2.5}>
                  <Typography variant="body2" color="text.secondary">
                    Add custom environment variables for your project.
                  </Typography>

                  {/* Add New Variable */}
                  <Paper
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 1.5,
                      bgcolor: theme.palette.background.paper,
                      border: `1px dashed ${alpha(theme.palette.primary.main, 0.3)}`,
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Box display="flex" gap={1} alignItems="flex-start">
                        <TextField
                          label="Key"
                          value={newEnvKey}
                          onChange={(e) => setNewEnvKey(e.target.value)}
                          placeholder="e.g., DBT_PROFILES_DIR"
                          sx={{ flex: 2 }}
                        />
                        <TextField
                          label="Value"
                          value={newEnvValue}
                          onChange={(e) => setNewEnvValue(e.target.value)}
                          placeholder="e.g., /app/profiles"
                          sx={{ flex: 3 }}
                        />
                        <IconButton
                          onClick={addEnvironmentVariable}
                          disabled={!newEnvKey.trim() || !newEnvValue.trim()}
                          sx={{
                            height: 40,
                            mt: 0.25,
                          }}
                        >
                          <AddOutlined />
                        </IconButton>
                      </Box>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ pl: 0.5 }}
                      >
                        Note: ROSETTA_GIT_USER and ROSETTA_GIT_PASSWORD are
                        reserved keys.
                      </Typography>
                    </Stack>
                  </Paper>

                  {/* Environment Variables List */}
                  {environmentVariables.length > 0 && (
                    <>
                      <Divider sx={{ mt: 1 }} />
                      <Stack spacing={1}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          fontWeight="600"
                          textTransform="uppercase"
                          sx={{ px: 0.5 }}
                        >
                          Added Variables
                        </Typography>
                        {environmentVariables.map((env) => (
                          <Paper
                            key={env.id}
                            elevation={0}
                            sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              bgcolor: alpha(
                                theme.palette.background.default,
                                theme.palette.mode === 'dark' ? 0.5 : 1,
                              ),
                              border: `1px solid ${theme.palette.divider}`,
                              transition: 'all 0.2s',
                              '&:hover': {
                                borderColor: alpha(
                                  theme.palette.primary.main,
                                  0.3,
                                ),
                                boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.1)}`,
                              },
                            }}
                          >
                            <Box display="flex" gap={1} alignItems="center">
                              <TextField
                                value={env.key}
                                onChange={(e) =>
                                  updateEnvironmentVariable(
                                    env.id,
                                    e.target.value,
                                    env.value,
                                  )
                                }
                                variant="outlined"
                                sx={{
                                  flex: 1,
                                  '& .MuiInputBase-input': {
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                    fontWeight: 600,
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
                                variant="outlined"
                                sx={{
                                  flex: 2,
                                  '& .MuiInputBase-input': {
                                    fontFamily: 'monospace',
                                    fontSize: '0.875rem',
                                  },
                                }}
                              />
                              <IconButton
                                onClick={() =>
                                  removeEnvironmentVariable(env.id)
                                }
                                sx={{
                                  color: 'error.main',
                                  bgcolor: alpha(
                                    theme.palette.error.main,
                                    0.08,
                                  ),
                                  '&:hover': {
                                    bgcolor: alpha(
                                      theme.palette.error.main,
                                      0.15,
                                    ),
                                  },
                                }}
                              >
                                <Delete />
                              </IconButton>
                            </Box>
                          </Paper>
                        ))}
                      </Stack>
                    </>
                  )}
                </Stack>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Action Buttons */}
          <Box
            display="flex"
            justifyContent="flex-end"
            gap={1.5}
            pt={1}
            borderTop={`1px solid ${theme.palette.divider}`}
          >
            <Button
              variant="outlined"
              onClick={onClose}
              disabled={isPushing}
              startIcon={<Close />}
              sx={{
                minWidth: 100,
                borderColor: alpha(theme.palette.divider, 0.5),
              }}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={disableSubmit}
              startIcon={buttonIcon}
              sx={{
                minWidth: 140,
                fontWeight: 600,
              }}
            >
              {buttonText}
            </Button>
          </Box>
        </Stack>
      </form>
    </Modal>
  );
};
