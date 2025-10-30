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
  Skeleton,
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
  useGetRepoInfo,
  useGetSecrets,
  usePushProjectToCloud,
} from '../../../controllers';
import { DbtCommandType, Project } from '../../../../types/backend';

interface EnvironmentVariable {
  key: string;
  value: string;
  id: string;
}

interface PushToCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  command: DbtCommandType;
}

const RESERVED_KEYS = ['ROSETTA_GIT_USER', 'ROSETTA_GIT_PASSWORD'];

export const PushToCloudModal: React.FC<PushToCloudModalProps> = ({
  isOpen,
  onClose,
  project,
  command,
}) => {
  const theme = useTheme();
  const { data: localChanges, isLoading: isLoadingChanges } =
    useGetLocalChanges(project.path);
  const { data: repoInfo, isLoading: isLoadingRepo } = useGetRepoInfo(
    project.path,
  );
  const { mutateAsync: pushProject, isLoading: isPushing } =
    usePushProjectToCloud();
  const { data: secrets = [] } = useGetSecrets(project.id);

  const [title, setTitle] = React.useState(project.name);
  const [gitUrl, setGitUrl] = React.useState('');
  const [gitBranch, setGitBranch] = React.useState('main');
  const [urlError, setUrlError] = React.useState('');
  const [titleError, setTitleError] = React.useState('');
  const [formError, setFormError] = React.useState('');

  const [githubUsername, setGithubUsername] = React.useState('');
  const [githubPassword, setGithubPassword] = React.useState('');
  const [showGithubPassword, setShowGithubPassword] = React.useState(false);

  const [environmentVariables, setEnvironmentVariables] = React.useState<
    EnvironmentVariable[]
  >([]);
  const [newEnvKey, setNewEnvKey] = React.useState('');
  const [newEnvValue, setNewEnvValue] = React.useState('');

  const isRunMode = React.useMemo(
    () => !!project?.externalId,
    [project?.externalId],
  );

  const hasLocalChanges = React.useMemo(() => {
    return (
      !!localChanges?.hasUntracked ||
      !!localChanges?.hasUncommitted ||
      !!localChanges?.hasUnpushed
    );
  }, [localChanges]);

  const isLoading = isLoadingRepo || isLoadingChanges;

  React.useEffect(() => {
    if (repoInfo) {
      if (repoInfo.remoteUrl) {
        setGitUrl(repoInfo.remoteUrl);
        setUrlError(''); // Clear any previous errors
      }
      if (repoInfo.currentBranch) {
        setGitBranch(repoInfo.currentBranch);
      }
    }
  }, [repoInfo]);

  React.useEffect(() => {
    if (secrets && secrets.length > 0) {
      const loadedSecrets = secrets
        .filter(
          (secret) =>
            secret.name !== 'ROSETTA_GIT_USER' &&
            secret.name !== 'ROSETTA_GIT_PASSWORD',
        )
        .map((secret) => ({
          id: secret.id,
          key: secret.name,
          value: secret.value,
        }));
      setEnvironmentVariables(loadedSecrets);
    }
  }, [secrets]);

  const blockingError = React.useMemo(() => {
    if (isLoading) return null;

    if (!repoInfo) {
      return {
        title: 'Unable to Load Repository Information',
        message:
          'Could not retrieve Git repository information for this project. Please ensure the project is properly initialized with Git.',
      };
    }

    if (!repoInfo.remoteUrl) {
      return {
        title: 'No Remote Repository Configured',
        message:
          'This project does not have a remote origin URL configured. Please add a remote repository using Git before deploying to the cloud.',
      };
    }

    if (!repoInfo.branchExistsOnRemote) {
      return {
        title: 'Current Branch Not Found on Remote',
        message: `The current branch "${repoInfo.currentBranch}" does not exist on the remote repository. Please push your branch to the remote before deploying to the cloud.`,
      };
    }

    return null;
  }, [repoInfo, isLoading]);

  const validateForm = React.useCallback(() => {
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
  }, [title, gitUrl, gitBranch]);

  const canSubmit = React.useMemo(() => {
    if (!project?.id || isPushing || isLoading || !!blockingError) {
      return false;
    }

    const hasTitle = !!title.trim();
    const hasUrl = !!gitUrl.trim();
    const noErrors = !urlError && !titleError;

    return hasTitle && hasUrl && noErrors;
  }, [
    project?.id,
    isPushing,
    isLoading,
    blockingError,
    title,
    gitUrl,
    urlError,
    titleError,
  ]);

  const handleGitUrlChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setGitUrl(event.target.value);
      if (urlError) {
        setUrlError('');
      }
    },
    [urlError],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    if (!validateForm()) {
      return;
    }

    if (!project?.id) {
      setFormError('Select a project to deploy.');
      return;
    }

    try {
      const reducedSecrets = environmentVariables.reduce(
        (acc, env) => {
          acc[env.key] = env.value;
          return acc;
        },
        {} as Record<string, string>,
      );

      reducedSecrets.ROSETTA_GIT_USER = githubUsername.trim();
      reducedSecrets.ROSETTA_GIT_PASSWORD = githubPassword;

      await pushProject({
        id: project.id,
        title: title.trim(),
        gitUrl: gitUrl.trim(),
        gitBranch: gitBranch.trim() || 'main',
        githubUsername: isRunMode ? undefined : githubUsername.trim(),
        githubPassword: isRunMode ? undefined : githubPassword,
        command,
        secrets: reducedSecrets,
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

  const addEnvironmentVariable = React.useCallback(() => {
    const trimmedKey = newEnvKey.trim().toUpperCase();
    const trimmedValue = newEnvValue.trim();

    if (!trimmedKey || !trimmedValue) {
      toast.error('Both key and value are required for environment variables');
      return;
    }

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

      if (RESERVED_KEYS.includes(uppercaseKey)) {
        toast.error(
          `${uppercaseKey} is a reserved key. Please use the dedicated fields.`,
        );
        return;
      }

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

  const buttonIcon = React.useMemo(() => {
    if (isPushing) return <CircularProgress size={18} />;
    return <CloudUpload />;
  }, [isPushing]);

  const buttonText = React.useMemo(() => {
    if (isPushing) return 'Running…';
    return 'Run on Cloud';
  }, [isPushing]);

  const renderLoadingSkeleton = () => (
    <Stack spacing={2.5}>
      <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
      <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
      <Skeleton variant="rectangular" height={56} sx={{ borderRadius: 2 }} />
    </Stack>
  );

  const renderBlockingError = () => {
    if (!blockingError) return null;

    return (
      <Alert
        severity="error"
        sx={{
          borderRadius: 2,
          bgcolor: alpha(theme.palette.error.main, 0.05),
          border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
        }}
      >
        <Typography variant="body2" fontWeight="600" gutterBottom>
          {blockingError.title}
        </Typography>
        <Typography variant="body2">{blockingError.message}</Typography>
      </Alert>
    );
  };

  const renderLocalChangesWarning = () => {
    if (!hasLocalChanges || !!blockingError) return null;

    return (
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
          Please commit and push your changes before deploying to ensure the
          cloud version matches your local environment.
        </Typography>
      </Alert>
    );
  };

  const renderDeploymentFields = () => {
    if (!!blockingError || isLoading) return null;

    return (
      <Stack spacing={2.5}>
        <TextField
          label="Project name"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          error={!!titleError}
          helperText={titleError || 'Displayed on Rosetta Cloud dashboards.'}
          disabled
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
            urlError || 'Auto-filled from your repository configuration.'
          }
          fullWidth
          required
          disabled
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
          helperText="Auto-filled from your current branch."
          fullWidth
          disabled
          sx={{
            '& .MuiOutlinedInput-root': {
              bgcolor: alpha(
                theme.palette.background.default,
                theme.palette.mode === 'dark' ? 0.4 : 0.5,
              ),
            },
          }}
        />

        {/* Git Credentials Section */}
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
                Git Credentials
              </Typography>
            </Box>
            <TextField
              label="GitHub username"
              value={isRunMode ? 'ROSETTA_GIT_USER' : githubUsername}
              slotProps={{
                input: { readOnly: isRunMode },
              }}
              onChange={(event) => setGithubUsername(event.target.value)}
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
              value={isRunMode ? 'ROSETTA_GIT_PASSWORD' : githubPassword}
              onChange={(event) => setGithubPassword(event.target.value)}
              fullWidth
              sx={{
                '& .MuiOutlinedInput-root': {
                  bgcolor: theme.palette.background.paper,
                },
              }}
              slotProps={{
                input: {
                  readOnly: isRunMode,
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
                },
              }}
            />
          </Stack>
        </Paper>
      </Stack>
    );
  };

  const renderEnvironmentVariables = () => {
    if (!!blockingError || isLoading) return null;

    return (
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
              {isRunMode
                ? 'View existing environment variables for your deployed project.'
                : 'Add custom environment variables for your project.'}
            </Typography>

            {/* Add New Variable - Only in non-run mode */}
            {!isRunMode && (
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
                    Note: ROSETTA_GIT_USER and ROSETTA_GIT_PASSWORD are reserved
                    keys.
                  </Typography>
                </Stack>
              </Paper>
            )}

            {environmentVariables.length > 0 && (
              <>
                {!isRunMode && <Divider sx={{ mt: 1 }} />}
                <Stack spacing={1}>
                  {!isRunMode && (
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      fontWeight="600"
                      textTransform="uppercase"
                      sx={{ px: 0.5 }}
                    >
                      Added Variables
                    </Typography>
                  )}
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
                        ...(!isRunMode && {
                          '&:hover': {
                            borderColor: alpha(theme.palette.primary.main, 0.3),
                            boxShadow: `0 0 0 1px ${alpha(theme.palette.primary.main, 0.1)}`,
                          },
                        }),
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
                          slotProps={{
                            input: {
                              readOnly: isRunMode,
                            },
                          }}
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
                          type={isRunMode ? 'password' : 'text'}
                          value={env.value}
                          onChange={(e) =>
                            updateEnvironmentVariable(
                              env.id,
                              env.key,
                              e.target.value,
                            )
                          }
                          variant="outlined"
                          slotProps={{
                            input: {
                              readOnly: isRunMode,
                            },
                          }}
                          sx={{
                            flex: 2,
                            '& .MuiInputBase-input': {
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            },
                          }}
                        />
                        {!isRunMode && (
                          <IconButton
                            onClick={() => removeEnvironmentVariable(env.id)}
                            sx={{
                              color: 'error.main',
                              bgcolor: alpha(theme.palette.error.main, 0.08),
                              '&:hover': {
                                bgcolor: alpha(theme.palette.error.main, 0.15),
                              },
                            }}
                          >
                            <Delete />
                          </IconButton>
                        )}
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              </>
            )}

            {/* Empty state for run mode with no secrets */}
            {isRunMode && environmentVariables.length === 0 && (
              <Box
                sx={{
                  p: 3,
                  textAlign: 'center',
                  borderRadius: 1.5,
                  bgcolor: alpha(
                    theme.palette.background.default,
                    theme.palette.mode === 'dark' ? 0.5 : 1,
                  ),
                  border: `1px dashed ${theme.palette.divider}`,
                }}
              >
                <Key
                  sx={{
                    fontSize: 40,
                    color: 'text.disabled',
                    mb: 1,
                  }}
                />
                <Typography variant="body2" color="text.secondary">
                  No environment variables configured for this project.
                </Typography>
              </Box>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isPushing) {
          onClose();
        }
      }}
      title="Run on Cloud"
    >
      <form onSubmit={handleSubmit}>
        <Stack spacing={3}>
          {/* Status Badge */}
          <Box display="flex" alignItems="center" gap={1.5}>
            {project?.externalId ? (
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
            Run your deployed project on the cloud.
          </Typography>

          {isLoading && renderLoadingSkeleton()}

          {!isLoading && renderBlockingError()}

          {!isLoading && renderLocalChangesWarning()}

          {formError && !blockingError && (
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

          {!isLoading && renderDeploymentFields()}

          {!isLoading && renderEnvironmentVariables()}

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
              disabled={!canSubmit}
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
