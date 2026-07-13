import React from 'react';
import {
  Box,
  Button,
  Typography,
  Stack,
  Paper,
  alpha,
  CircularProgress,
  Chip,
} from '@mui/material';
import {
  Close,
  AccountTree,
  CheckCircleOutline,
  PlayArrow,
  Code,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { toast } from 'react-toastify';
import { Modal } from '../modal';
import { projectsServices } from '../../../services';
import { Project } from '../../../../types/backend';

interface PipelineTemplate {
  id: string;
  label: string;
  description: string;
  badge?: string;
  steps: string[];
  content: string;
}

const TEMPLATES: PipelineTemplate[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    badge: 'Recommended',
    description:
      'A simple pipeline that runs dbt deps, dbt test, and a teardown step. Perfect for new projects.',
    steps: ['dbt deps', 'dbt test', 'teardown'],
    content: `name: "CI"
jobs:
  - name: "setup"
    steps:
      - name: Install dependencies
        plugin: dbt@v1
        command: dbt deps
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
`,
  },
  {
    id: 'full-ci',
    label: 'Full CI/CD',
    badge: 'Advanced',
    description:
      'A complete pipeline with dependency install, model runs, tests, freshness checks, and a deploy notification step.',
    steps: [
      'dbt deps',
      'dbt run',
      'dbt test',
      'dbt source freshness',
      'deploy',
    ],
    content: `name: "Full CI/CD"
jobs:
  - name: "setup"
    steps:
      - name: Install dependencies
        plugin: dbt@v1
        command: dbt deps
  - name: "build"
    steps:
      - name: Run models
        plugin: dbt@v1
        command: dbt run
  - name: "test"
    steps:
      - name: Run tests
        plugin: dbt@v1
        command: dbt test
      - name: Check source freshness
        plugin: dbt@v1
        command: dbt source freshness
  - name: "deploy"
    steps:
      - name: Notify deployment
        plugin: command@v1
        command: echo "Deployment complete"
  - name: "teardown"
    type: "cleanup"
    steps:
      - name: Run teardown
        plugin: command@v1
        command: echo "TEARDOWN"
`,
  },
];

interface CreatePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onCreated: (filePath: string) => void;
}

export const CreatePipelineModal: React.FC<CreatePipelineModalProps> = ({
  isOpen,
  onClose,
  project,
  onCreated,
}) => {
  const theme = useTheme();
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null);
  const [isCreating, setIsCreating] = React.useState(false);

  // Reset selection when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setSelectedTemplateId(null);
    }
  }, [isOpen]);

  const handleCreate = async () => {
    if (!selectedTemplateId) return;

    const template = TEMPLATES.find((t) => t.id === selectedTemplateId);
    if (!template) return;

    setIsCreating(true);
    try {
      // Ensure .rosetta directory exists
      await projectsServices.createFolder({
        filePath: project.path,
        name: '.rosetta',
      });

      const pipelinePath = `${project.path}/.rosetta/pipeline.yml`;
      await projectsServices.saveFileContent({
        path: pipelinePath,
        content: template.content,
      });

      toast.success('Pipeline created successfully.');
      onCreated(pipelinePath);
      onClose();
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create pipeline';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Pipeline"
      maxWidth="sm"
    >
      <Stack spacing={3}>
        {/* Header description */}
        <Typography variant="body2" color="text.secondary">
          Choose a template to scaffold your pipeline. The file will be created
          at <code>.rosetta/pipeline.yml</code> in your project.
        </Typography>

        {/* Template cards */}
        <Stack spacing={1.5}>
          {TEMPLATES.map((template) => {
            const isSelected = selectedTemplateId === template.id;
            return (
              <Paper
                key={template.id}
                variant="outlined"
                onClick={() => setSelectedTemplateId(template.id)}
                sx={{
                  p: 2,
                  cursor: 'pointer',
                  border: '1px solid',
                  borderColor: isSelected
                    ? 'primary.main'
                    : theme.palette.divider,
                  bgcolor: isSelected
                    ? alpha(
                        theme.palette.primary.main,
                        theme.palette.mode === 'dark' ? 0.1 : 0.04,
                      )
                    : 'background.paper',
                  transition: 'border-color 0.15s, background-color 0.15s',
                  '&:hover': {
                    borderColor: 'primary.main',
                    bgcolor: alpha(
                      theme.palette.primary.main,
                      theme.palette.mode === 'dark' ? 0.08 : 0.03,
                    ),
                  },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 1.5,
                  }}
                >
                  {/* Icon */}
                  <Box
                    sx={{
                      mt: 0.25,
                      p: 0.75,
                      borderRadius: 1,
                      bgcolor: isSelected
                        ? alpha(theme.palette.primary.main, 0.12)
                        : alpha(theme.palette.text.secondary, 0.08),
                      color: isSelected ? 'primary.main' : 'text.secondary',
                      display: 'flex',
                      flexShrink: 0,
                    }}
                  >
                    <AccountTree sx={{ fontSize: 18 }} />
                  </Box>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={isSelected ? 'primary.main' : 'text.primary'}
                      >
                        {template.label}
                      </Typography>
                      {template.badge && (
                        <Chip
                          label={template.badge}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.6rem' }}
                        />
                      )}
                    </Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ lineHeight: 1.5, display: 'block' }}
                    >
                      {template.description}
                    </Typography>

                    {/* Steps preview */}
                    <Box
                      sx={{
                        mt: 1,
                        display: 'flex',
                        gap: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      {template.steps.map((step) => (
                        <Box
                          key={step}
                          sx={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 0.4,
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 0.75,
                            bgcolor: alpha(theme.palette.text.secondary, 0.07),
                          }}
                        >
                          <Code sx={{ fontSize: 10, opacity: 0.6 }} />
                          <Typography
                            variant="caption"
                            sx={{ fontSize: '0.65rem', opacity: 0.8 }}
                          >
                            {step}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Box>

                  {/* Checkmark */}
                  {isSelected && (
                    <CheckCircleOutline
                      sx={{
                        color: 'primary.main',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    />
                  )}
                </Box>
              </Paper>
            );
          })}
        </Stack>

        {/* Footer actions */}
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
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!selectedTemplateId || isCreating}
            startIcon={
              isCreating ? <CircularProgress size={16} /> : <PlayArrow />
            }
            sx={{ minWidth: 140, fontWeight: 600 }}
          >
            {isCreating ? 'Creating...' : 'Create Pipeline'}
          </Button>
        </Box>
      </Stack>
    </Modal>
  );
};
