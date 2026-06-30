import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  styled,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  TextField,
  Divider,
  Stepper,
  Step,
  StepLabel,
  CircularProgress,
} from '@mui/material';
import AccountTreeIcon from '@mui/icons-material/AccountTree';
import CloudIcon from '@mui/icons-material/Cloud';
import StorageIcon from '@mui/icons-material/Storage';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import {
  gitServices,
  projectsServices,
  connectorsServices,
} from '../../services';
import { useSelectProject } from '../../controllers';
import { useSecureStorage } from '../../hooks';

const StyledDialogContent = styled(DialogContent)`
  padding: 24px;
`;

const HeaderSection = styled(Box)`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const FeaturesList = styled(List)`
  margin: 16px 0;
`;

const FeatureItem = styled(ListItem)`
  padding: 4px 0;
`;

const FieldRow = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 8px;
`;

const STEPS = ['Overview', 'Configuration'];

interface Config {
  bqProject: string;
  bqDataset: string;
  /** Raw JSON content of the service-account key file (pasted by user) */
  serviceAccountJson: string;
  connectionName: string;
}

interface GetStartedPipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GetStartedPipelineModal: React.FC<
  GetStartedPipelineModalProps
> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const { mutate: selectProject } = useSelectProject();
  const { setBigQueryServiceAccountKey } = useSecureStorage();
  const [activeStep, setActiveStep] = React.useState(0);
  const [isCreatingProject, setIsCreatingProject] = React.useState(false);

  const [config, setConfig] = React.useState<Config>({
    bqProject: '',
    bqDataset: '',
    serviceAccountJson: '',
    connectionName: '',
  });

  const handleChange =
    (field: keyof Config) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setConfig((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const isConfigValid =
    config.bqProject.trim() !== '' &&
    config.bqDataset.trim() !== '' &&
    config.connectionName.trim() !== '';

  /** Replace all occurrences of a search string inside a file via IPC. */
  const patchFile = async (
    filePath: string,
    replacements: [string, string][],
  ) => {
    try {
      let content = await projectsServices.getFileContent({ path: filePath });
      for (const [search, replace] of replacements) {
        content = content.split(search).join(replace);
      }
      await projectsServices.saveFileContent({ path: filePath, content });
    } catch {
      // Non-fatal — file may not exist
    }
  };

  const handleCreateProject = async () => {
    setIsCreatingProject(true);
    const url = 'https://github.com/rosettadb/pipeline-getting-started.git';

    try {
      // Validate JSON early before doing network work
      const hasJson = config.serviceAccountJson.trim() !== '';
      let parsedServiceAccount: any = null;
      if (hasJson) {
        try {
          parsedServiceAccount = JSON.parse(config.serviceAccountJson.trim());
        } catch {
          toast.error(
            'Invalid Service Account JSON — please paste the full contents of your .json key file.',
          );
          return;
        }
      }

      const {
        error,
        authRequired,
        path,
        name,
        connectionId: staleConnectionId,
      } = await gitServices.gitClone(url, undefined, true);

      if (error) {
        toast.error(error);
        return;
      }

      if (authRequired) {
        toast.error('Authentication required!');
        return;
      }

      if (!path || !name) {
        toast.error('Something went wrong!');
        return;
      }

      // The connectionId returned by gitClone was built from the unpatched
      // placeholder profiles.yml — discard it and build a correct one below.
      if (staleConnectionId) {
        try {
          await connectorsServices.deleteConnection(staleConnectionId);
        } catch {
          // Non-fatal
        }
      }

      const newProject = config.bqProject.trim();
      const newDataset = config.bqDataset.trim();

      // `path` from gitClone points to the dbt sub-project dir; go up one level
      // to reach the repo root where rosetta/ lives.
      const projectRoot = path.split('/').slice(0, -1).join('/') || path;

      const commonReplacements: [string, string][] = [
        ['YOUR_PROJECT_ID', newProject],
        ['YOUR_DATASET_NAME', newDataset],
        ['adaptivescale-178418', newProject],
        ['demo_jetron', newDataset],
      ];

      await Promise.all([
        patchFile(`${projectRoot}/rosetta/main.conf`, commonReplacements),
        patchFile(
          `${projectRoot}/rosetta/bigquery/model.yaml`,
          commonReplacements,
        ),
      ]);

      // Store the service account JSON in secure storage so it can be retrieved by standard connections flow
      if (hasJson && config.connectionName.trim()) {
        await setBigQueryServiceAccountKey(
          config.serviceAccountJson.trim(),
          config.connectionName.trim(),
        );
      }

      // Build the ConnectionInput from actual user values
      const connectionInput = {
        type: 'bigquery' as const,
        name: config.connectionName.trim(),
        project: newProject,
        dataset: newDataset,
        method: 'service-account' as const,
        keyfile: hasJson ? config.serviceAccountJson.trim() : '',
        location: '',
        priority: 'interactive' as const,
        host: '',
        port: 443,
        database: newProject,
        schema: newDataset,
        username: newProject,
        password: '',
      };

      // Register project without stale connection
      const project = await projectsServices.addProjectFromVCS({
        path,
        name,
        connectionId: undefined,
      });

      // Configure the correct connection and link it to the project
      await connectorsServices.configureConnection({
        projectId: project.id,
        connection: connectionInput,
      });

      selectProject({ projectId: project.id });
      toast.success('Pipeline getting started project created successfully!');
      onClose();
      navigate('/app/loading');
    } catch (err: any) {
      toast.error(
        err.message ||
          'Failed to create pipeline getting started project. Please try again.',
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleClose = () => {
    if (!isCreatingProject) {
      setActiveStep(0);
      setConfig({
        bqProject: '',
        bqDataset: '',
        serviceAccountJson: '',
        connectionName: '',
      });
      onClose();
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="get-started-pipeline-dialog-title"
    >
      <DialogTitle id="get-started-pipeline-dialog-title">
        <HeaderSection>
          <AccountTreeIcon color="primary" />
          <Typography variant="h6" component="span">
            Get Started with Pipeline
          </Typography>
        </HeaderSection>
        <Stepper activeStep={activeStep} sx={{ mt: 1 }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </DialogTitle>

      <StyledDialogContent>
        {activeStep === 0 && (
          <>
            <Typography variant="body1">
              Import our example Pipeline project to explore an end-to-end
              orchestration flow. This project demonstrates how Terraform,
              Rosetta, and dbt work together in a fully automated CI pipeline
              targeting BigQuery.
            </Typography>

            <Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
              What&apos;s included:
            </Typography>

            <FeaturesList>
              <FeatureItem>
                <ListItemIcon>
                  <CloudIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Terraform"
                  secondary="Provisions and tears down a BigQuery dataset automatically"
                />
              </FeatureItem>

              <FeatureItem>
                <ListItemIcon>
                  <AccountTreeIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="Rosetta Pipeline"
                  secondary="Orchestrates the full flow via a .rosetta/pipeline.yml config"
                />
              </FeatureItem>

              <FeatureItem>
                <ListItemIcon>
                  <StorageIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="dbt on BigQuery"
                  secondary="Seeds sample data and runs transformations in BigQuery"
                />
              </FeatureItem>

              <FeatureItem>
                <ListItemIcon>
                  <CheckCircleIcon color="primary" />
                </ListItemIcon>
                <ListItemText
                  primary="End-to-End CI Example"
                  secondary="Full pipeline from infrastructure provisioning to data testing"
                />
              </FeatureItem>
            </FeaturesList>

            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Click <strong>Next</strong> to configure your BigQuery credentials
              before the project is created.
            </Typography>
          </>
        )}

        {activeStep === 1 && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              These values will be written into <code>profiles.yml</code> and{' '}
              <code>rosetta/main.conf</code> so the project connects to your
              BigQuery instance.
            </Typography>

            <Divider sx={{ mb: 2 }} />

            <FieldRow>
              <TextField
                label="Connection Name"
                placeholder="e.g. MY_PROJECT_ID"
                required
                fullWidth
                size="small"
                value={config.connectionName}
                onChange={handleChange('connectionName')}
                helperText="A unique display name for this connection"
              />

              <TextField
                label="Project ID"
                placeholder="e.g. my-gcp-project-123"
                required
                fullWidth
                size="small"
                value={config.bqProject}
                onChange={handleChange('bqProject')}
                helperText="The GCP project where BigQuery is hosted"
              />

              <TextField
                label="Dataset"
                placeholder="e.g. my_dataset"
                required
                fullWidth
                size="small"
                value={config.bqDataset}
                onChange={handleChange('bqDataset')}
                helperText="The BigQuery dataset that dbt will use"
              />

              <TextField
                label="Service Account Key (JSON)"
                name="keyfile"
                value={config.serviceAccountJson}
                onChange={handleChange('serviceAccountJson')}
                fullWidth
                multiline
                rows={10}
                required={false}
                variant="outlined"
                helperText="Optional — paste your service account JSON. Leave blank to use Application Default Credentials (oauth)."
                InputProps={{
                  style: { minHeight: '120px' },
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    height: 'auto',
                  },
                  '& .MuiInputBase-inputMultiline': {
                    height: 'auto !important',
                    resize: 'vertical',
                  },
                }}
              />
            </FieldRow>
          </>
        )}
      </StyledDialogContent>

      <DialogActions sx={{ padding: '16px 24px', gap: 1 }}>
        <Button onClick={handleClose} disabled={isCreatingProject}>
          Cancel
        </Button>

        {activeStep === 0 && (
          <Button
            variant="contained"
            color="primary"
            onClick={() => setActiveStep(1)}
          >
            Next
          </Button>
        )}

        {activeStep === 1 && (
          <>
            <Button
              variant="outlined"
              onClick={() => setActiveStep(0)}
              disabled={isCreatingProject}
            >
              Back
            </Button>
            <Button
              onClick={handleCreateProject}
              variant="contained"
              color="primary"
              disabled={isCreatingProject || !isConfigValid}
              startIcon={
                isCreatingProject ? (
                  <CircularProgress size={16} color="inherit" />
                ) : (
                  <AccountTreeIcon />
                )
              }
            >
              {isCreatingProject ? 'Creating...' : 'Create Pipeline Project'}
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
};
