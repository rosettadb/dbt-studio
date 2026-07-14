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
  Switch,
  FormControlLabel,
  Popover,
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  Tooltip,
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
  VpnKey,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import {
  useGetLocalChanges,
  useGetRepoInfo,
  useGetSecrets,
  usePushProjectToCloud,
  useExtractProfileEnvVars,
} from '../../../controllers';
import { DbtCommandType, Project } from '../../../../types/backend';
import { secureStorageService } from '../../../services/secureStorage.service';
import { SecureStorageAccount } from '../../../../types/frontend';

interface EnvironmentVariable {
  key: string;
  value: string;
  id: string;
  isEdited?: boolean;
  originalValue?: string;
  isFromProfile?: boolean;
  isFromKeystore?: boolean;
}

interface PushToCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  command: DbtCommandType;
  initialDbtArguments?: string;
}

const RESERVED_KEYS = ['ROSETTA_GIT_USER', 'ROSETTA_GIT_PASSWORD'];

export const PushToCloudModal: React.FC<PushToCloudModalProps> = ({
  isOpen,
  onClose,
  project,
  command,
  initialDbtArguments = '',
}) => {
  const theme = useTheme();
  const { data: localChanges, isLoading: isLoadingChanges } =
    useGetLocalChanges(project.path);
  const { data: repoInfo, isLoading: isLoadingRepo } = useGetRepoInfo(
    project.path,
  );
  const { mutateAsync: pushProject, isLoading: isPushing } =
    usePushProjectToCloud();
  const isDeployed = !!project?.externalId;
  const {
    data: secrets = [],
    isSuccess: secretsLoaded,
    isError: secretsFailed,
  } = useGetSecrets(isDeployed ? project.id : undefined);
  const secretsSettled = secretsLoaded || secretsFailed;
  const { data: profileEnvVars = [], isSuccess: profileLoaded } =
    useExtractProfileEnvVars(project.id);

  const isPipelineMode = command === 'pipeline';

  const [title, setTitle] = React.useState(project.name);
  const [gitUrl, setGitUrl] = React.useState('');
  const [gitBranch, setGitBranch] = React.useState('main');
  const [urlError, setUrlError] = React.useState('');
  const [titleError, setTitleError] = React.useState('');
  const [formError, setFormError] = React.useState('');

  const [githubUsername, setGithubUsername] = React.useState('');
  const [githubPassword, setGithubPassword] = React.useState('');
  const [originalGithubUsername, setOriginalGithubUsername] =
    React.useState('');
  const [originalGithubPassword, setOriginalGithubPassword] =
    React.useState('');
  const [showGithubPassword, setShowGithubPassword] = React.useState(false);
  const [isGithubUsernameEdited, setIsGithubUsernameEdited] =
    React.useState(false);
  const [isGithubPasswordEdited, setIsGithubPasswordEdited] =
    React.useState(false);

  const [environmentVariables, setEnvironmentVariables] = React.useState<
    EnvironmentVariable[]
  >([]);
  const [runTeardown, setRunTeardown] = React.useState(true);
  const [newEnvKey, setNewEnvKey] = React.useState('');
  const [newEnvValue, setNewEnvValue] = React.useState('');
  const [dbtArguments, setDbtArguments] = React.useState(initialDbtArguments);

  // Keystore picker state
  const [keystoreAnchor, setKeystoreAnchor] =
    React.useState<HTMLButtonElement | null>(null);
  const [keystoreKeys, setKeystoreKeys] = React.useState<string[]>([]);
  const [keystoreLoading, setKeystoreLoading] = React.useState(false);
  const [keystoreAdding, setKeystoreAdding] = React.useState<string | null>(
    null,
  );

  React.useEffect(() => {
    setDbtArguments(initialDbtArguments);
  }, [initialDbtArguments]);

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
        setUrlError('');
      }
      if (repoInfo.currentBranch) {
        setGitBranch(repoInfo.currentBranch);
      }
    }
  }, [repoInfo]);

  // Merge profile env vars with cloud secrets — only on initial load
  const envVarsInitialized = React.useRef(false);
  React.useEffect(() => {
    if (envVarsInitialized.current) return;
    // Wait until queries have completed
    if (!profileLoaded) return;
    if (isDeployed && !secretsSettled) return;

    envVarsInitialized.current = true;

    const secretMap = new Map(
      secrets
        .filter(
          (s) =>
            s.name !== 'ROSETTA_GIT_USER' && s.name !== 'ROSETTA_GIT_PASSWORD',
        )
        .map((s) => [s.name, s]),
    );

    // Build env vars from profile first (these are required)
    const profileVars: EnvironmentVariable[] = profileEnvVars
      .filter((pv) => !RESERVED_KEYS.includes(pv.name))
      .map((pv) => {
        const existing = secretMap.get(pv.name);
        secretMap.delete(pv.name);
        return {
          id: existing?.id || `profile-${pv.name}`,
          key: pv.name,
          value: existing?.value || '',
          originalValue: existing?.value || '',
          isEdited: false,
          isFromProfile: true,
        };
      });

    // Add remaining cloud secrets that aren't in profile
    const extraVars: EnvironmentVariable[] = Array.from(secretMap.values()).map(
      (s) => ({
        id: s.id,
        key: s.name,
        value: s.value,
        originalValue: s.value,
        isEdited: false,
        isFromProfile: false,
      }),
    );

    setEnvironmentVariables([...profileVars, ...extraVars]);

    // Load git credentials
    const gitUser = secrets.find((s) => s.name === 'ROSETTA_GIT_USER');
    const gitPassword = secrets.find((s) => s.name === 'ROSETTA_GIT_PASSWORD');
    if (gitUser) {
      setGithubUsername(gitUser.value);
      setOriginalGithubUsername(gitUser.value);
    }
    if (gitPassword) {
      setGithubPassword(gitPassword.value);
      setOriginalGithubPassword(gitPassword.value);
    }
  }, [secrets, profileEnvVars, isDeployed, profileLoaded, secretsSettled]);

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

    // Wait for environment variables to finish loading
    if (!profileLoaded || (isDeployed && !secretsSettled)) {
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
    profileLoaded,
    secretsSettled,
    isDeployed,
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
      const reducedSecrets = environmentVariables
        .filter((env) => env.isEdited || !env.isFromProfile)
        .reduce(
          (acc, env) => {
            acc[env.key] = env.value;
            return acc;
          },
          {} as Record<string, string>,
        );

      // Only add git credentials if they were edited
      if (isGithubUsernameEdited) {
        reducedSecrets.ROSETTA_GIT_USER = githubUsername.trim();
      }
      if (isGithubPasswordEdited) {
        reducedSecrets.ROSETTA_GIT_PASSWORD = githubPassword;
      }

      // Extract pipeline file name from dbtArguments (--pipeline_name <name>)
      const pipelineNameMatch = dbtArguments.match(/--pipeline_name\s+(\S+)/);
      const pipelineFileName = pipelineNameMatch
        ? `${pipelineNameMatch[1]}.yml`
        : undefined;

      const fullCommand = dbtArguments.trim()
        ? `dbt ${command} ${dbtArguments.trim()}`
        : `dbt ${command}`;

      await pushProject({
        id: project.id,
        title: title.trim(),
        gitUrl: gitUrl.trim(),
        gitBranch: gitBranch.trim() || 'main',
        githubUsername: isRunMode ? undefined : githubUsername.trim(),
        githubPassword: isRunMode ? undefined : githubPassword,
        CUSTOM_DBT_COMMANDS: isPipelineMode ? undefined : fullCommand,
        EXECUTION_MODE: isPipelineMode ? 'pipeline' : 'command',
        PIPELINE_FILE: isPipelineMode ? pipelineFileName : undefined,
        ROSETTA_RUN_TEARDOWN: isPipelineMode ? runTeardown : undefined,
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
    const trimmedKey = newEnvKey.trim();
    const trimmedValue = newEnvValue.trim();

    if (!trimmedKey || !trimmedValue) {
      toast.error('Both key and value are required for environment variables');
      return;
    }

    if (RESERVED_KEYS.includes(trimmedKey.toUpperCase())) {
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
      originalValue: trimmedValue,
      isEdited: true,
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
      if (RESERVED_KEYS.includes(key.toUpperCase())) {
        toast.error(
          `${key} is a reserved key. Please use the dedicated fields.`,
        );
        return;
      }

      const exists = environmentVariables.some(
        (env) => env.key === key && env.id !== id,
      );
      if (exists) {
        toast.error('Environment variable key already exists');
        return;
      }

      setEnvironmentVariables((prev) =>
        prev.map((env) =>
          env.id === id ? { ...env, key, value, isEdited: true } : env,
        ),
      );
    },
    [environmentVariables],
  );

  const handleEnvFocus = React.useCallback((id: string) => {
    setEnvironmentVariables((prev) =>
      prev.map((env) =>
        env.id === id
          ? {
              ...env,
              value: env.isEdited ? env.value : '',
              isEdited: true,
            }
          : env,
      ),
    );
  }, []);

  const handleEnvBlur = React.useCallback((id: string) => {
    setEnvironmentVariables((prev) =>
      prev.map((env) => {
        if (env.id === id) {
          if (!env.value.trim() || env.value === env.originalValue) {
            return {
              ...env,
              value: env.originalValue || '',
              isEdited: false,
            };
          }
        }
        return env;
      }),
    );
  }, []);

  const handleOpenKeystore = React.useCallback(
    async (event: React.MouseEvent<HTMLButtonElement>) => {
      setKeystoreAnchor(event.currentTarget);
      setKeystoreLoading(true);
      setKeystoreKeys([]);
      try {
        const keys = await secureStorageService.list();
        // Filter out internal/system keys (those used for db/cloud connections)
        const userKeys = keys.filter(
          (k) =>
            !k.startsWith('db-') &&
            !k.startsWith('cloud-') &&
            !k.startsWith('openai') &&
            !k.startsWith('ollama') &&
            !k.startsWith('gemini') &&
            !k.startsWith('anthropic') &&
            !k.startsWith('lmstudio') &&
            !k.startsWith('openai-compatible'),
        );
        setKeystoreKeys(userKeys);
      } catch {
        setKeystoreKeys([]);
        toast.error('Failed to load keystore entries');
      } finally {
        setKeystoreLoading(false);
      }
    },
    [],
  );

  const handleAddFromKeystore = React.useCallback(
    async (keystoreKey: string) => {
      setKeystoreAdding(keystoreKey);
      try {
        const value = await secureStorageService.get(
          keystoreKey as SecureStorageAccount,
        );
        if (value === null) {
          toast.error(`Could not retrieve value for "${keystoreKey}"`);
          return;
        }

        // Strip environment prefix for the variable key (e.g. "dev.MY_KEY" → "MY_KEY")
        const varKey = keystoreKey.includes('.')
          ? keystoreKey.slice(keystoreKey.indexOf('.') + 1)
          : keystoreKey;

        if (RESERVED_KEYS.includes(varKey.toUpperCase())) {
          toast.error(`${varKey} is a reserved key`);
          return;
        }

        const alreadyExists = environmentVariables.some(
          (env) => env.key === varKey,
        );
        if (alreadyExists) {
          // Update existing entry with the keystore value
          setEnvironmentVariables((prev) =>
            prev.map((env) =>
              env.key === varKey
                ? { ...env, value, isEdited: true, isFromKeystore: true }
                : env,
            ),
          );
          toast.success(`Updated "${varKey}" from keystore`);
        } else {
          const newEntry: EnvironmentVariable = {
            id: `keystore-${Date.now()}`,
            key: varKey,
            value,
            originalValue: '',
            isEdited: true,
            isFromKeystore: true,
          };
          setEnvironmentVariables((prev) => [...prev, newEntry]);
          toast.success(`Added "${varKey}" from keystore`);
        }

        setKeystoreAnchor(null);
      } catch {
        toast.error(`Failed to retrieve value for "${keystoreKey}"`);
      } finally {
        setKeystoreAdding(null);
      }
    },
    [environmentVariables],
  );

  const handleGithubUsernameFocus = React.useCallback(() => {
    if (!isGithubUsernameEdited) {
      setGithubUsername('');
      setIsGithubUsernameEdited(true);
    }
  }, [isGithubUsernameEdited]);

  const handleGithubUsernameBlur = React.useCallback(() => {
    if (!githubUsername.trim()) {
      setGithubUsername(originalGithubUsername);
      setIsGithubUsernameEdited(false);
    }
  }, [githubUsername, originalGithubUsername]);

  const handleGithubPasswordFocus = React.useCallback(() => {
    if (!isGithubPasswordEdited) {
      setGithubPassword('');
      setIsGithubPasswordEdited(true);
    }
  }, [isGithubPasswordEdited]);

  const handleGithubPasswordBlur = React.useCallback(() => {
    if (!githubPassword.trim()) {
      setGithubPassword(originalGithubPassword);
      setIsGithubPasswordEdited(false);
    }
  }, [githubPassword, originalGithubPassword]);

  const buttonIcon = React.useMemo(() => {
    if (isPushing) return <CircularProgress size={18} />;
    return <CloudUpload />;
  }, [isPushing]);

  const buttonText = React.useMemo(() => {
    if (isPushing) return 'Running\u2026';
    if (isPipelineMode) return 'Run Pipeline on Cloud';
    return 'Run on Cloud';
  }, [isPushing, isPipelineMode]);

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

        <Divider sx={{ my: 1 }} />

        {!isPipelineMode && (
          <TextField
            label="Command"
            value={`dbt ${command}`}
            fullWidth
            disabled
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: alpha(
                  theme.palette.background.default,
                  theme.palette.mode === 'dark' ? 0.4 : 0.5,
                ),
              },
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
                fontWeight: 600,
              },
            }}
            helperText="The dbt command that will be executed on the cloud."
          />
        )}

        {!isPipelineMode && (
          <TextField
            label="Additional dbt Arguments"
            value={dbtArguments}
            onChange={(event) => setDbtArguments(event.target.value)}
            placeholder="e.g., --select my_model --full-refresh"
            fullWidth
            multiline
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: alpha(
                  theme.palette.background.default,
                  theme.palette.mode === 'dark' ? 0.4 : 0.5,
                ),
              },
              '& .MuiInputBase-input': {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              },
            }}
            helperText="Optional: Add dbt arguments like --select, --exclude, --full-refresh, --vars, etc."
          />
        )}

        {isPipelineMode && (
          <Paper
            elevation={0}
            sx={{
              p: 1.5,
              px: 2,
              borderRadius: 2,
              bgcolor: runTeardown
                ? alpha(
                    theme.palette.success.main,
                    theme.palette.mode === 'dark' ? 0.1 : 0.05,
                  )
                : alpha(theme.palette.action.disabled, 0.05),
              border: `1px solid ${
                runTeardown
                  ? alpha(theme.palette.success.main, 0.3)
                  : theme.palette.divider
              }`,
              transition: 'all 0.2s',
            }}
          >
            <FormControlLabel
              control={
                <Switch
                  checked={runTeardown}
                  onChange={(e) => setRunTeardown(e.target.checked)}
                  color="success"
                />
              }
              label={runTeardown ? 'Teardown Enabled' : 'Teardown Disabled'}
              sx={{
                m: 0,
                '& .MuiFormControlLabel-label': {
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: runTeardown ? 'success.main' : 'text.secondary',
                },
              }}
            />
          </Paper>
        )}

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
              type={
                !isGithubUsernameEdited && originalGithubUsername
                  ? 'password'
                  : 'text'
              }
              value={githubUsername}
              onChange={(event) => setGithubUsername(event.target.value)}
              onFocus={handleGithubUsernameFocus}
              onBlur={handleGithubUsernameBlur}
              placeholder={
                !isGithubUsernameEdited && originalGithubUsername
                  ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                  : ''
              }
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
              onFocus={handleGithubPasswordFocus}
              onBlur={handleGithubPasswordBlur}
              placeholder={
                !isGithubPasswordEdited && originalGithubPassword
                  ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                  : ''
              }
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

    const profileVars = environmentVariables.filter((e) => e.isFromProfile);
    const customVars = environmentVariables.filter((e) => !e.isFromProfile);

    return (
      <Accordion
        defaultExpanded
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
            {/* Required variables from profiles.yml */}
            {profileVars.length > 0 && (
              <>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight="600"
                  textTransform="uppercase"
                  sx={{ px: 0.5 }}
                >
                  Required (from profiles.yml)
                </Typography>
                <Stack spacing={1}>
                  {profileVars.map((env) => (
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
                        border: `1px solid ${env.isEdited ? alpha(theme.palette.success.main, 0.3) : theme.palette.divider}`,
                        transition: 'all 0.2s',
                      }}
                    >
                      <Box display="flex" gap={1} alignItems="center">
                        <TextField
                          value={env.key}
                          variant="outlined"
                          slotProps={{ input: { readOnly: true } }}
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
                          type={
                            isRunMode && !env.isEdited ? 'password' : 'text'
                          }
                          value={env.value}
                          onChange={(e) =>
                            updateEnvironmentVariable(
                              env.id,
                              env.key,
                              e.target.value,
                            )
                          }
                          onFocus={() => handleEnvFocus(env.id)}
                          onBlur={() => handleEnvBlur(env.id)}
                          variant="outlined"
                          placeholder={
                            isRunMode && !env.isEdited
                              ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                              : 'Enter value'
                          }
                          sx={{
                            flex: 2,
                            '& .MuiInputBase-input': {
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            },
                          }}
                        />
                        {env.isEdited && (
                          <Chip
                            label="Modified"
                            size="small"
                            sx={{
                              height: 20,
                              fontSize: '0.7rem',
                              bgcolor: alpha(theme.palette.success.main, 0.1),
                              color: 'success.main',
                            }}
                          />
                        )}
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              </>
            )}

            {/* Custom / extra variables */}
            {customVars.length > 0 && (
              <>
                <Divider sx={{ mt: 1 }} />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight="600"
                  textTransform="uppercase"
                  sx={{ px: 0.5 }}
                >
                  Custom Variables
                </Typography>
                <Stack spacing={1}>
                  {customVars.map((env) => (
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
                        border: `1px solid ${env.isEdited ? alpha(theme.palette.success.main, 0.3) : theme.palette.divider}`,
                        transition: 'all 0.2s',
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
                            input: { readOnly: isRunMode },
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
                          type={
                            isRunMode && (!env.isEdited || env.isFromKeystore)
                              ? 'password'
                              : 'text'
                          }
                          value={env.value}
                          onChange={(e) =>
                            updateEnvironmentVariable(
                              env.id,
                              env.key,
                              e.target.value,
                            )
                          }
                          onFocus={() => handleEnvFocus(env.id)}
                          onBlur={() => handleEnvBlur(env.id)}
                          variant="outlined"
                          placeholder={
                            isRunMode && (!env.isEdited || env.isFromKeystore)
                              ? '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022'
                              : ''
                          }
                          sx={{
                            flex: 2,
                            '& .MuiInputBase-input': {
                              fontFamily: 'monospace',
                              fontSize: '0.875rem',
                            },
                          }}
                        />
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
                      </Box>
                    </Paper>
                  ))}
                </Stack>
              </>
            )}

            {/* Add new custom variable */}
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
                <Box
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ pl: 0.5 }}
                  >
                    Add additional custom environment variables.
                  </Typography>
                  <Tooltip title="Pick a variable from your local keystore">
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<VpnKey sx={{ fontSize: 14 }} />}
                      onClick={handleOpenKeystore}
                      sx={{
                        fontSize: '0.75rem',
                        textTransform: 'none',
                        borderColor: alpha(theme.palette.primary.main, 0.4),
                        color: 'primary.main',
                        '&:hover': {
                          borderColor: 'primary.main',
                          bgcolor: alpha(theme.palette.primary.main, 0.06),
                        },
                      }}
                    >
                      From Keystore
                    </Button>
                  </Tooltip>
                </Box>

                {/* Keystore picker popover */}
                <Popover
                  open={Boolean(keystoreAnchor)}
                  anchorEl={keystoreAnchor}
                  onClose={() => setKeystoreAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                  transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  slotProps={{
                    paper: {
                      sx: {
                        mt: 0.5,
                        minWidth: 260,
                        maxWidth: 360,
                        maxHeight: 320,
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        borderRadius: 2,
                        border: `1px solid ${theme.palette.divider}`,
                        boxShadow: theme.shadows[4],
                      },
                    },
                  }}
                >
                  <Box
                    sx={{
                      px: 2,
                      py: 1.5,
                      borderBottom: `1px solid ${theme.palette.divider}`,
                      bgcolor: alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'dark' ? 0.12 : 0.04,
                      ),
                    }}
                  >
                    <Box display="flex" alignItems="center" gap={1}>
                      <VpnKey sx={{ fontSize: 16, color: 'primary.main' }} />
                      <Typography variant="subtitle2" fontWeight="600">
                        Select from Keystore
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      display="block"
                      mt={0.25}
                    >
                      Click a key to add it as an environment variable
                    </Typography>
                  </Box>

                  {keystoreLoading && (
                    <Box
                      display="flex"
                      justifyContent="center"
                      alignItems="center"
                      py={3}
                    >
                      <CircularProgress size={20} />
                    </Box>
                  )}
                  {!keystoreLoading && keystoreKeys.length === 0 && (
                    <Box px={2} py={3} textAlign="center">
                      <VpnKey
                        sx={{ fontSize: 32, color: 'text.disabled', mb: 1 }}
                      />
                      <Typography variant="body2" color="text.secondary">
                        No keystore entries found.
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mt={0.5}
                      >
                        Add variables in Settings → Keystore.
                      </Typography>
                    </Box>
                  )}
                  {!keystoreLoading && keystoreKeys.length > 0 && (
                    <List
                      dense
                      disablePadding
                      sx={{ overflowY: 'auto', flex: 1 }}
                    >
                      {keystoreKeys.map((k) => {
                        const displayKey = k.includes('.')
                          ? k.slice(k.indexOf('.') + 1)
                          : k;
                        const envPrefix = k.includes('.')
                          ? k.slice(0, k.indexOf('.'))
                          : null;
                        const isAdding = keystoreAdding === k;
                        return (
                          <ListItemButton
                            key={k}
                            onClick={() => handleAddFromKeystore(k)}
                            disabled={keystoreAdding !== null}
                            sx={{
                              py: 1,
                              px: 2,
                              '&:hover': {
                                bgcolor: alpha(
                                  theme.palette.primary.main,
                                  0.06,
                                ),
                              },
                            }}
                          >
                            <ListItemIcon sx={{ minWidth: 32 }}>
                              {isAdding ? (
                                <CircularProgress size={14} />
                              ) : (
                                <Key
                                  sx={{
                                    fontSize: 14,
                                    color: 'text.secondary',
                                  }}
                                />
                              )}
                            </ListItemIcon>
                            <ListItemText
                              primary={
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontFamily: 'monospace',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                  }}
                                >
                                  {displayKey}
                                </Typography>
                              }
                              secondary={
                                envPrefix && (
                                  <Typography
                                    variant="caption"
                                    color="text.disabled"
                                    sx={{ fontFamily: 'monospace' }}
                                  >
                                    env: {envPrefix}
                                  </Typography>
                                )
                              }
                            />
                          </ListItemButton>
                        );
                      })}
                    </List>
                  )}
                </Popover>
              </Stack>
            </Paper>

            {isDeployed && secretsFailed && (
              <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
                Couldn&apos;t load saved secrets from Rosetta Cloud. You can
                still set environment variables below, but existing cloud
                secrets won&apos;t be shown or preserved unless re-added.
              </Alert>
            )}

            {/* eslint-disable-next-line no-nested-ternary */}
            {!profileLoaded || (isDeployed && !secretsSettled) ? (
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
                <CircularProgress size={24} sx={{ mb: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Loading environment variables...
                </Typography>
              </Box>
            ) : environmentVariables.length === 0 ? (
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
                  No environment variables detected for this project.
                </Typography>
              </Box>
            ) : null}
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
      title={isPipelineMode ? 'Run Pipeline on Cloud' : 'Run on Cloud'}
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
            {isPipelineMode
              ? 'Run a pipeline on the cloud. Pipelines execute a sequence of steps defined in your .rosetta/ directory.'
              : 'Run your deployed project on the cloud.'}
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
