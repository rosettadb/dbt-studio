import React from 'react';
import {
  Box,
  Button,
  Typography,
  CircularProgress,
  Stack,
  useTheme,
  alpha,
  Paper,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Skeleton,
  Alert,
} from '@mui/material';
import {
  Close,
  AccountTree,
  AddOutlined,
  PlayArrow,
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { useListPipelines } from '../../../controllers';
import { Project } from '../../../../types/backend';
import { projectsServices } from '../../../services';
import { getFileStatus, isFileUnpushed } from '../../../services/git.service';

interface PipelineSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onSelect: (pipelineName: string) => void;
}

const PIPELINE_TEMPLATE = `name: "CI"
jobs:
  - name: "run-dbt-command"
    steps:
      - name: dbt test
        plugin: dbt@v1
        command: dbt test
  - name: "teardown"
    type: "cleanup"
    steps:
      - name: Run teardown
        plugin: command@v1
        command: echo "TEARDOWN"
`;

export const PipelineSelectorModal: React.FC<PipelineSelectorModalProps> = ({
  isOpen,
  onClose,
  project,
  onSelect,
}) => {
  const theme = useTheme();
  const {
    data: pipelines = [],
    isLoading,
    refetch,
  } = useListPipelines(project.id);

  const [selected, setSelected] = React.useState('');
  const [isCreating, setIsCreating] = React.useState(false);
  const [fileStatus, setFileStatus] = React.useState<string | null>(null);
  const [isUnpushed, setIsUnpushed] = React.useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(false);
  const [statusCheckedFor, setStatusCheckedFor] = React.useState('');

  // Auto-select when only one pipeline (only once)
  const autoSelected = React.useRef(false);
  React.useEffect(() => {
    if (!autoSelected.current && pipelines.length === 1) {
      autoSelected.current = true;
      setSelected(pipelines[0].name);
    }
  }, [pipelines]);

  // Check git status when selection changes
  React.useEffect(() => {
    if (!selected || selected === statusCheckedFor) {
      return;
    }

    const pipeline = pipelines.find((p) => p.name === selected);
    if (!pipeline) return;

    let cancelled = false;
    setIsCheckingStatus(true);
    setFileStatus(null);
    setIsUnpushed(false);

    const relativePath = pipeline.path
      .replace(project.path, '')
      .replace(/^[/\\]/, '');

    Promise.all([
      getFileStatus(project.path, relativePath),
      isFileUnpushed(project.path, relativePath),
    ])
      .then(([status, unpushed]) => {
        // eslint-disable-next-line promise/always-return
        if (!cancelled) {
          setFileStatus(status?.status || null);
          setIsUnpushed(!!unpushed);
          setIsCheckingStatus(false);
          setStatusCheckedFor(selected);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFileStatus(null);
          setIsUnpushed(false);
          setIsCheckingStatus(false);
          setStatusCheckedFor(selected);
        }
      });

    // eslint-disable-next-line consistent-return
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, project.path]);

  const hasUncommittedChanges =
    fileStatus === 'untracked' ||
    fileStatus === 'modified' ||
    fileStatus === 'staged';

  const hasBlockingChanges = hasUncommittedChanges || isUnpushed;

  const handleCreatePipeline = async () => {
    setIsCreating(true);
    try {
      // Ensure rosetta/pipelines directory exists before writing into it
      await projectsServices.createFolderAsync({
        filePath: project.path,
        name: 'rosetta/pipelines',
      });

      const pipelinePath = `${project.path}/rosetta/pipelines/pipeline.yml`;
      await projectsServices.saveFileContent({
        path: pipelinePath,
        content: PIPELINE_TEMPLATE,
      });

      await window.electron.ipcRenderer.invoke('git:add', {
        repoPath: project.path,
        files: ['rosetta/pipelines/pipeline.yml'],
      });
      await window.electron.ipcRenderer.invoke('git:commit', {
        repoPath: project.path,
        message: 'chore: add default pipeline configuration',
      });
      try {
        await window.electron.ipcRenderer.invoke('git:push', {
          repoPath: project.path,
        });
      } catch {
        toast.warning(
          'Pipeline created and committed, but push failed. Please push manually before running on cloud.',
        );
        await refetch();
        setIsCreating(false);
        return;
      }

      toast.success('Pipeline created, committed, and pushed.');
      await refetch();
      setSelected('pipeline');
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create pipeline';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleConfirm = () => {
    if (selected && !hasBlockingChanges) {
      onSelect(selected);
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <Stack spacing={2}>
          <Skeleton
            variant="rectangular"
            height={56}
            sx={{ borderRadius: 2 }}
          />
          <Skeleton
            variant="rectangular"
            height={56}
            sx={{ borderRadius: 2 }}
          />
        </Stack>
      );
    }

    // No pipelines — creation wizard
    if (pipelines.length === 0) {
      return (
        <Paper
          elevation={0}
          sx={{
            p: 3,
            borderRadius: 2,
            bgcolor: alpha(
              theme.palette.info.main,
              theme.palette.mode === 'dark' ? 0.08 : 0.04,
            ),
            border: `1px solid ${alpha(theme.palette.info.main, 0.2)}`,
          }}
        >
          <Stack spacing={2} alignItems="center" textAlign="center">
            <AccountTree
              sx={{ fontSize: 48, color: 'info.main', opacity: 0.7 }}
            />
            <Typography variant="subtitle1" fontWeight="600">
              No Pipelines Found
            </Typography>
            <Typography variant="body2" color="text.secondary">
              No pipeline configuration files were found under{' '}
              <code>rosetta/pipelines/</code>. A pipeline defines a sequence of
              steps (e.g., dbt deps, dbt run, dbt test) that will be executed on
              the cloud.
            </Typography>
            <Button
              variant="contained"
              onClick={handleCreatePipeline}
              disabled={isCreating}
              startIcon={
                isCreating ? <CircularProgress size={16} /> : <AddOutlined />
              }
              sx={{ mt: 1 }}
            >
              {isCreating ? 'Creating...' : 'Create Default Pipeline & Push'}
            </Button>
            <Typography variant="caption" color="text.secondary">
              This will create <code>rosetta/pipelines/pipeline.yml</code>,
              commit, and push it to your remote repository.
            </Typography>
          </Stack>
        </Paper>
      );
    }

    // Pipelines exist — selector
    return (
      <Stack spacing={2.5}>
        <Typography variant="body2" color="text.secondary">
          Select which pipeline to run on the cloud.
        </Typography>
        <FormControl fullWidth>
          <InputLabel id="pipeline-select-label">Pipeline</InputLabel>
          <Select
            labelId="pipeline-select-label"
            value={selected}
            label="Pipeline"
            onChange={(e) => setSelected(e.target.value)}
          >
            {pipelines.map((p) => (
              <MenuItem key={p.name} value={p.name}>
                {p.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {hasBlockingChanges && (
          <Alert
            severity="error"
            sx={{
              borderRadius: 2,
              bgcolor: alpha(theme.palette.error.main, 0.05),
              border: `1px solid ${alpha(theme.palette.error.main, 0.2)}`,
            }}
          >
            <Typography variant="body2" fontWeight="600" gutterBottom>
              {hasUncommittedChanges
                ? 'Uncommitted Changes'
                : 'Unpushed Changes'}
            </Typography>
            <Typography variant="body2">
              {hasUncommittedChanges
                ? `The selected pipeline file has uncommitted changes (${fileStatus}). Please commit and push your changes before running on the cloud.`
                : 'The selected pipeline file has been committed but not pushed to the remote. Please push your changes before running on the cloud.'}
            </Typography>
          </Alert>
        )}
      </Stack>
    );
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Run Pipeline">
      <Stack spacing={3}>
        {renderContent()}

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
            startIcon={<Close />}
            sx={{
              minWidth: 100,
              borderColor: alpha(theme.palette.divider, 0.5),
            }}
          >
            Cancel
          </Button>
          {pipelines.length > 0 && (
            <Button
              variant="contained"
              color="primary"
              onClick={handleConfirm}
              disabled={!selected || hasBlockingChanges || isCheckingStatus}
              startIcon={
                isCheckingStatus ? (
                  <CircularProgress size={16} />
                ) : (
                  <PlayArrow />
                )
              }
              sx={{ minWidth: 140, fontWeight: 600 }}
            >
              Continue
            </Button>
          )}
        </Box>
      </Stack>
    </Modal>
  );
};
