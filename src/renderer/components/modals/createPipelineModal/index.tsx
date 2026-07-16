import React from 'react';
import {
  Box,
  Button,
  Typography,
  Stack,
  alpha,
  CircularProgress,
  Chip,
  Dialog,
  DialogContent,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Close,
  AccountTree,
  CheckCircle,
  PlayArrow,
  Code,
  ArrowForward,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { toast } from 'react-toastify';
import { projectsServices } from '../../../services';
import { Project } from '../../../../types/backend';

interface PipelineTemplate {
  id: string;
  label: string;
  description: string;
  badge?: string;
  badgeColor?: 'success' | 'warning' | 'primary' | 'info';
  steps: string[];
  fileName: string;
  content: string;
}

const TEMPLATES: PipelineTemplate[] = [
  {
    id: 'getting-started',
    label: 'Getting Started',
    badge: 'Recommended',
    badgeColor: 'success',
    description:
      'A simple pipeline that runs dbt deps, dbt test, and a teardown step. Perfect for new projects.',
    steps: ['dbt deps', 'dbt test', 'teardown'],
    fileName: 'pipeline-getting-started.yml',
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
    badgeColor: 'warning',
    description:
      'A complete pipeline with dependency install, model runs, tests, freshness checks, and a deploy notification step.',
    steps: [
      'dbt deps',
      'dbt run',
      'dbt test',
      'dbt source freshness',
      'deploy',
    ],
    fileName: 'pipeline-full-ci.yml',
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
  const isDark = theme.palette.mode === 'dark';

  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null);
  const [isCreating, setIsCreating] = React.useState(false);

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
      await projectsServices.createFolder({
        filePath: project.path,
        name: '.rosetta',
      });

      const pipelinePath = `${project.path}/.rosetta/${template.fileName}`;
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
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{
        sx: {
          borderRadius: 2.5,
          overflow: 'hidden',
          backgroundImage: 'none',
          boxShadow: isDark
            ? '0 24px 48px rgba(0,0,0,0.6)'
            : '0 24px 48px rgba(0,0,0,0.16)',
        },
      }}
    >
      {/* Gradient header */}
      <Box
        sx={{
          px: 3,
          pt: 3,
          pb: 2.5,
          background: isDark
            ? `linear-gradient(135deg, ${alpha(theme.palette.primary.dark, 0.5)} 0%, ${alpha(theme.palette.primary.main, 0.2)} 100%)`
            : `linear-gradient(135deg, ${theme.palette.primary.main} 0%, ${alpha(theme.palette.primary.light, 0.85)} 100%)`,
          position: 'relative',
        }}
      >
        {/* Close button */}
        <IconButton
          onClick={onClose}
          size="small"
          sx={{
            position: 'absolute',
            top: 12,
            right: 12,
            color: isDark
              ? alpha(theme.palette.common.white, 0.7)
              : alpha(theme.palette.common.white, 0.9),
            '&:hover': {
              bgcolor: alpha(theme.palette.common.white, 0.15),
            },
          }}
        >
          <Close fontSize="small" />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
          <Box
            sx={{
              p: 1,
              borderRadius: 1.5,
              bgcolor: alpha(theme.palette.common.white, isDark ? 0.1 : 0.2),
              display: 'flex',
            }}
          >
            <AccountTree
              sx={{
                fontSize: 22,
                color: isDark ? theme.palette.primary.light : '#fff',
              }}
            />
          </Box>
          <Typography
            variant="h6"
            fontWeight={700}
            sx={{ color: isDark ? theme.palette.primary.light : '#fff' }}
          >
            Create Pipeline
          </Typography>
        </Box>

        <Typography
          variant="body2"
          sx={{
            color: isDark
              ? alpha(theme.palette.common.white, 0.6)
              : alpha(theme.palette.common.white, 0.85),
            maxWidth: 420,
          }}
        >
          Choose a template to scaffold your pipeline. Files are created inside{' '}
          <Box
            component="code"
            sx={{
              fontFamily: 'monospace',
              fontSize: '0.8em',
              px: 0.5,
              py: 0.1,
              borderRadius: 0.5,
              bgcolor: alpha(theme.palette.common.white, 0.15),
            }}
          >
            .rosetta/
          </Box>
        </Typography>
      </Box>

      <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
        <Stack spacing={0} divider={<Divider />}>
          {TEMPLATES.map((template) => {
            const isSelected = selectedTemplateId === template.id;

            const selectedBgColor = isDark
              ? alpha(theme.palette.primary.main, 0.12)
              : alpha(theme.palette.primary.main, 0.05);

            const hoverSelectedBg = isDark
              ? alpha(theme.palette.primary.main, 0.16)
              : alpha(theme.palette.primary.main, 0.07);

            const hoverBgColor = isSelected ? hoverSelectedBg : 'transparent';

            const unselectedIconBg = isDark
              ? alpha(theme.palette.common.white, 0.06)
              : alpha(theme.palette.common.black, 0.05);

            return (
              <Box
                key={template.id}
                onClick={() => setSelectedTemplateId(template.id)}
                sx={{
                  px: 3,
                  py: 2.5,
                  cursor: 'pointer',
                  position: 'relative',
                  bgcolor: isSelected ? selectedBgColor : 'background.paper',
                  transition: 'background-color 0.15s',
                  '&:hover': {
                    bgcolor: hoverBgColor,
                  },
                }}
              >
                {/* Selected accent bar */}
                {isSelected && (
                  <Box
                    sx={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      width: 3,
                      bgcolor: 'primary.main',
                      borderRadius: '0 2px 2px 0',
                    }}
                  />
                )}

                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  {/* Icon */}
                  <Box
                    sx={{
                      mt: 0.25,
                      p: 1,
                      borderRadius: 1.5,
                      flexShrink: 0,
                      bgcolor: isSelected
                        ? alpha(theme.palette.primary.main, 0.15)
                        : unselectedIconBg,
                      color: isSelected ? 'primary.main' : 'text.secondary',
                      display: 'flex',
                      transition: 'background-color 0.15s',
                    }}
                  >
                    <AccountTree sx={{ fontSize: 20 }} />
                  </Box>

                  {/* Content */}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Title row */}
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
                          color={template.badgeColor ?? 'primary'}
                          variant={isSelected ? 'filled' : 'outlined'}
                          sx={{
                            height: 18,
                            fontSize: '0.6rem',
                            fontWeight: 600,
                            letterSpacing: '0.03em',
                          }}
                        />
                      )}
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ lineHeight: 1.6, display: 'block', mb: 1.25 }}
                    >
                      {template.description}
                    </Typography>

                    {/* Pipeline steps flow */}
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 0.5,
                        flexWrap: 'wrap',
                      }}
                    >
                      {template.steps.map((step, i) => (
                        <React.Fragment key={step}>
                          <Box
                            sx={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 0.4,
                              px: 0.75,
                              py: 0.3,
                              borderRadius: 1,
                              border: '1px solid',
                              borderColor: isSelected
                                ? alpha(theme.palette.primary.main, 0.3)
                                : alpha(theme.palette.divider, 1),
                              bgcolor: isSelected
                                ? alpha(theme.palette.primary.main, 0.08)
                                : 'transparent',
                              transition: 'all 0.15s',
                            }}
                          >
                            <Code
                              sx={{
                                fontSize: 10,
                                color: isSelected
                                  ? 'primary.main'
                                  : 'text.disabled',
                              }}
                            />
                            <Typography
                              variant="caption"
                              sx={{
                                fontSize: '0.65rem',
                                fontFamily: 'monospace',
                                color: isSelected
                                  ? 'primary.main'
                                  : 'text.secondary',
                                fontWeight: isSelected ? 500 : 400,
                              }}
                            >
                              {step}
                            </Typography>
                          </Box>
                          {i < template.steps.length - 1 && (
                            <ArrowForward
                              sx={{
                                fontSize: 10,
                                color: isSelected
                                  ? alpha(theme.palette.primary.main, 0.5)
                                  : alpha(theme.palette.text.disabled, 0.5),
                                flexShrink: 0,
                              }}
                            />
                          )}
                        </React.Fragment>
                      ))}
                    </Box>

                    {/* File path */}
                    <Typography
                      variant="caption"
                      sx={{
                        mt: 1,
                        display: 'block',
                        fontFamily: 'monospace',
                        fontSize: '0.65rem',
                        color: isSelected ? 'primary.main' : 'text.disabled',
                        opacity: 0.8,
                      }}
                    >
                      .rosetta/{template.fileName}
                    </Typography>
                  </Box>

                  {/* Checkmark */}
                  <Box
                    sx={{
                      mt: 0.25,
                      flexShrink: 0,
                      opacity: isSelected ? 1 : 0,
                      transition: 'opacity 0.15s',
                    }}
                  >
                    <CheckCircle sx={{ color: 'primary.main', fontSize: 20 }} />
                  </Box>
                </Box>
              </Box>
            );
          })}
        </Stack>

        {/* Footer */}
        <Box
          sx={{
            px: 3,
            py: 2,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 1.5,
            bgcolor: isDark
              ? alpha(theme.palette.common.white, 0.02)
              : alpha(theme.palette.common.black, 0.02),
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Button variant="outlined" onClick={onClose} sx={{ minWidth: 90 }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleCreate}
            disabled={!selectedTemplateId || isCreating}
            startIcon={
              isCreating ? (
                <CircularProgress size={15} color="inherit" />
              ) : (
                <PlayArrow />
              )
            }
            sx={{
              minWidth: 150,
              fontWeight: 600,
              boxShadow: selectedTemplateId
                ? `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`
                : 'none',
              transition: 'box-shadow 0.2s',
            }}
          >
            {isCreating ? 'Creating…' : 'Create Pipeline'}
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
};
