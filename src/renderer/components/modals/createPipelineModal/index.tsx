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
  DialogActions,
  DialogTitle,
  IconButton,
  Divider,
} from '@mui/material';
import {
  Close,
  ArrowBack,
  AccountTree,
  InsertDriveFileOutlined,
  CheckCircle,
  PlayArrow,
  Code,
  ArrowForward,
  Public,
  ChevronRight,
  ErrorOutline,
  Refresh,
  WarningAmber,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import { toast } from 'react-toastify';
import { projectsServices } from '../../../services';
import { Project } from '../../../../types/backend';
import {
  listPipelineTemplates,
  fetchPipelineTemplateContent,
  RemotePipelineTemplate,
} from '../../../services/pipelineTemplates.service';

interface PipelineTemplate {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  badge?: string;
  badgeColor?: 'success' | 'warning' | 'primary' | 'info';
  steps: string[];
  fileName: string;
  content: string;
}

const TEMPLATES: PipelineTemplate[] = [
  {
    id: 'blank',
    label: 'Create Blank',
    icon: InsertDriveFileOutlined,
    description:
      'Start from an empty pipeline and add your own jobs and steps.',
    steps: [],
    fileName: 'pipeline-blank.yml',
    content: `name: "Pipeline"
jobs: []
`,
  },
  {
    id: 'generic',
    label: 'Generic',
    icon: AccountTree,
    badge: 'Recommended',
    badgeColor: 'success',
    description:
      'A simple pipeline that runs dbt deps, dbt test, and a teardown step. Perfect for new projects.',
    steps: ['dbt deps', 'dbt test', 'teardown'],
    fileName: 'pipeline-generic.yml',
    content: `name: "Generic"
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
];

interface CreatePipelineModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project;
  onCreated: (filePath: string) => void;
}

type ModalView = 'menu' | 'browse';

export const CreatePipelineModal: React.FC<CreatePipelineModalProps> = ({
  isOpen,
  onClose,
  project,
  onCreated,
}) => {
  const theme = useTheme();
  const isDark = theme.palette.mode === 'dark';

  const [view, setView] = React.useState<ModalView>('menu');
  const [selectedTemplateId, setSelectedTemplateId] = React.useState<
    string | null
  >(null);
  const [isCreating, setIsCreating] = React.useState(false);

  const [remoteTemplates, setRemoteTemplates] = React.useState<
    RemotePipelineTemplate[]
  >([]);
  const [isLoadingRemote, setIsLoadingRemote] = React.useState(false);
  const [remoteError, setRemoteError] = React.useState<string | null>(null);
  const [selectedRemoteId, setSelectedRemoteId] = React.useState<string | null>(
    null,
  );
  const [pendingCreate, setPendingCreate] = React.useState<{
    fileName: string;
    getContent: () => Promise<string>;
  } | null>(null);

  React.useEffect(() => {
    if (isOpen) {
      setView('menu');
      setSelectedTemplateId(null);
      setSelectedRemoteId(null);
      setPendingCreate(null);
      setRemoteTemplates([]);
      setRemoteError(null);
    }
  }, [isOpen]);

  const loadRemoteTemplates = React.useCallback(async () => {
    setIsLoadingRemote(true);
    setRemoteError(null);
    try {
      const result = await listPipelineTemplates();
      setRemoteTemplates(result);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to load templates';
      setRemoteError(msg);
    } finally {
      setIsLoadingRemote(false);
    }
  }, []);

  const handleBrowseTemplates = () => {
    setView('browse');
    setSelectedRemoteId(null);
    if (remoteTemplates.length === 0 && !isLoadingRemote) {
      loadRemoteTemplates();
    }
  };

  const writePipelineFile = async (fileName: string, content: string) => {
    await projectsServices.createFolder({
      filePath: project.path,
      name: '.rosetta',
    });

    const pipelinePath = `${project.path}/.rosetta/${fileName}`;
    await projectsServices.saveFileContent({
      path: pipelinePath,
      content,
    });

    return pipelinePath;
  };

  const pipelineExists = async (fileName: string): Promise<boolean> => {
    const pipelines = await projectsServices.listPipelines(project.id);
    const baseName = fileName.replace(/\.(yml|yaml)$/, '');
    return pipelines.some((p) => p.name === baseName);
  };

  const createPipeline = async (fileName: string, content: string) => {
    const pipelinePath = await writePipelineFile(fileName, content);
    toast.success('Pipeline created successfully.');
    onCreated(pipelinePath);
    onClose();
  };

  const prepareCreate = async (
    fileName: string,
    getContent: () => Promise<string>,
  ) => {
    setIsCreating(true);
    try {
      if (await pipelineExists(fileName)) {
        setPendingCreate({ fileName, getContent });
        return;
      }
      await createPipeline(fileName, await getContent());
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create pipeline';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const handleCreate = async () => {
    if (view === 'menu') {
      if (!selectedTemplateId) return;
      const template = TEMPLATES.find((t) => t.id === selectedTemplateId);
      if (!template) return;
      await prepareCreate(template.fileName, async () => template.content);
      return;
    }

    if (!selectedRemoteId) return;
    const template = remoteTemplates.find((t) => t.id === selectedRemoteId);
    if (!template) return;
    await prepareCreate(template.fileName, () =>
      fetchPipelineTemplateContent(template.url),
    );
  };

  const handleOverride = async () => {
    if (!pendingCreate) return;
    setIsCreating(true);
    try {
      const content = await pendingCreate.getContent();
      await createPipeline(pendingCreate.fileName, content);
      setPendingCreate(null);
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Failed to create pipeline';
      toast.error(msg);
    } finally {
      setIsCreating(false);
    }
  };

  const isBrowseView = view === 'browse';
  const isActionDisabled = isBrowseView
    ? !selectedRemoteId || isCreating
    : !selectedTemplateId || isCreating;
  const hasSelection = isBrowseView ? !!selectedRemoteId : !!selectedTemplateId;
  const actionLabel = isBrowseView ? 'Use Template' : 'Create Pipeline';

  return (
    <>
      <Dialog
        open={isOpen}
        onClose={onClose}
        fullWidth
        maxWidth={isBrowseView ? 'md' : 'sm'}
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
          {isBrowseView && (
            <IconButton
              onClick={() => setView('menu')}
              size="small"
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                color: isDark
                  ? alpha(theme.palette.common.white, 0.7)
                  : alpha(theme.palette.common.white, 0.9),
                '&:hover': {
                  bgcolor: alpha(theme.palette.common.white, 0.15),
                },
              }}
            >
              <ArrowBack fontSize="small" />
            </IconButton>
          )}

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

          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1.5,
              mb: 1,
              pl: isBrowseView ? 4.5 : 0,
            }}
          >
            <Box
              sx={{
                p: 1,
                borderRadius: 1.5,
                bgcolor: alpha(theme.palette.common.white, isDark ? 0.1 : 0.2),
                display: 'flex',
              }}
            >
              {isBrowseView ? (
                <Public
                  sx={{
                    fontSize: 22,
                    color: isDark ? theme.palette.primary.light : '#fff',
                  }}
                />
              ) : (
                <AccountTree
                  sx={{
                    fontSize: 22,
                    color: isDark ? theme.palette.primary.light : '#fff',
                  }}
                />
              )}
            </Box>
            <Typography
              variant="h6"
              fontWeight={700}
              sx={{ color: isDark ? theme.palette.primary.light : '#fff' }}
            >
              {isBrowseView ? 'Browse Templates' : 'Create Pipeline'}
            </Typography>
          </Box>

          <Typography
            variant="body2"
            sx={{
              color: isDark
                ? alpha(theme.palette.common.white, 0.6)
                : alpha(theme.palette.common.white, 0.85),
              maxWidth: isBrowseView ? undefined : 420,
            }}
          >
            {isBrowseView ? (
              <>
                Community pipeline templates from{' '}
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
                  rosettadb/dbt-studio-templates
                </Box>
              </>
            ) : (
              <>
                Choose a template to scaffold your pipeline. Files are created
                inside{' '}
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
              </>
            )}
          </Typography>
        </Box>

        <DialogContent sx={{ p: 0, overflow: 'hidden' }}>
          {!isBrowseView && (
            <Stack spacing={0} divider={<Divider />}>
              {TEMPLATES.map((template) => {
                const isSelected = selectedTemplateId === template.id;
                const Icon = template.icon;

                const selectedBgColor = isDark
                  ? alpha(theme.palette.primary.main, 0.12)
                  : alpha(theme.palette.primary.main, 0.05);

                const hoverSelectedBg = isDark
                  ? alpha(theme.palette.primary.main, 0.16)
                  : alpha(theme.palette.primary.main, 0.07);

                const hoverBgColor = isSelected
                  ? hoverSelectedBg
                  : 'transparent';

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
                      bgcolor: isSelected
                        ? selectedBgColor
                        : 'background.paper',
                      transition: 'background-color 0.15s',
                      '&:hover': {
                        bgcolor: hoverBgColor,
                      },
                    }}
                  >
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

                    <Box
                      sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}
                    >
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
                        <Icon sx={{ fontSize: 20 }} />
                      </Box>

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
                          sx={{
                            lineHeight: 1.6,
                            display: 'block',
                            mb: template.steps.length > 0 ? 1.25 : 0,
                          }}
                        >
                          {template.description}
                        </Typography>

                        {template.steps.length > 0 && (
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
                                        : alpha(
                                            theme.palette.text.disabled,
                                            0.5,
                                          ),
                                      flexShrink: 0,
                                    }}
                                  />
                                )}
                              </React.Fragment>
                            ))}
                          </Box>
                        )}

                        <Typography
                          variant="caption"
                          sx={{
                            mt: 1,
                            display: 'block',
                            fontFamily: 'monospace',
                            fontSize: '0.65rem',
                            color: isSelected
                              ? 'primary.main'
                              : 'text.disabled',
                            opacity: 0.8,
                          }}
                        >
                          .rosetta/{template.fileName}
                        </Typography>
                      </Box>

                      <Box
                        sx={{
                          mt: 0.25,
                          flexShrink: 0,
                          opacity: isSelected ? 1 : 0,
                          transition: 'opacity 0.15s',
                        }}
                      >
                        <CheckCircle
                          sx={{ color: 'primary.main', fontSize: 20 }}
                        />
                      </Box>
                    </Box>
                  </Box>
                );
              })}

              {/* Browse Templates */}
              <Box
                onClick={handleBrowseTemplates}
                sx={{
                  px: 3,
                  py: 2.5,
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  transition: 'background-color 0.15s',
                  '&:hover': {
                    bgcolor: isDark
                      ? alpha(theme.palette.common.white, 0.03)
                      : alpha(theme.palette.common.black, 0.02),
                  },
                }}
              >
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                  <Box
                    sx={{
                      mt: 0.25,
                      p: 1,
                      borderRadius: 1.5,
                      flexShrink: 0,
                      bgcolor: isDark
                        ? alpha(theme.palette.common.white, 0.06)
                        : alpha(theme.palette.common.black, 0.05),
                      color: 'text.secondary',
                      display: 'flex',
                    }}
                  >
                    <Public sx={{ fontSize: 20 }} />
                  </Box>

                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1,
                        mb: 0.5,
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        Browse Templates
                      </Typography>
                      <Chip
                        label="Community"
                        size="small"
                        color="info"
                        variant="outlined"
                        sx={{
                          height: 18,
                          fontSize: '0.6rem',
                          fontWeight: 600,
                          letterSpacing: '0.03em',
                        }}
                      />
                    </Box>

                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ lineHeight: 1.6, display: 'block' }}
                    >
                      Explore community pipeline templates on GitHub and use one
                      to scaffold your pipeline.
                    </Typography>
                  </Box>

                  <Box sx={{ mt: 0.25, flexShrink: 0, color: 'text.disabled' }}>
                    <ChevronRight sx={{ fontSize: 20 }} />
                  </Box>
                </Box>
              </Box>
            </Stack>
          )}

          {isBrowseView && (
            <>
              {isLoadingRemote && (
                <Box
                  sx={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    py: 6,
                  }}
                >
                  <CircularProgress size={28} />
                </Box>
              )}

              {!isLoadingRemote && remoteError && (
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 1.5,
                    py: 6,
                    px: 3,
                  }}
                >
                  <ErrorOutline sx={{ fontSize: 32, color: 'error.main' }} />
                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ textAlign: 'center' }}
                  >
                    {remoteError}
                  </Typography>
                  <Button
                    size="small"
                    startIcon={<Refresh />}
                    onClick={loadRemoteTemplates}
                  >
                    Retry
                  </Button>
                </Box>
              )}

              {!isLoadingRemote &&
                !remoteError &&
                remoteTemplates.length === 0 && (
                  <Box sx={{ py: 6, px: 3, textAlign: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      No templates available.
                    </Typography>
                  </Box>
                )}

              {!isLoadingRemote &&
                !remoteError &&
                remoteTemplates.length > 0 && (
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fill, minmax(240px, 1fr))',
                      gap: 2,
                      p: 3,
                      maxHeight: 480,
                      overflowY: 'auto',
                    }}
                  >
                    {remoteTemplates.map((template) => {
                      const isSelected = selectedRemoteId === template.id;

                      const selectedCardBg = isDark
                        ? alpha(theme.palette.primary.main, 0.12)
                        : alpha(theme.palette.primary.main, 0.05);

                      return (
                        <Box
                          key={template.id}
                          onClick={() => setSelectedRemoteId(template.id)}
                          sx={{
                            position: 'relative',
                            p: 2,
                            borderRadius: 2,
                            cursor: 'pointer',
                            border: '1px solid',
                            borderColor: isSelected
                              ? 'primary.main'
                              : theme.palette.divider,
                            bgcolor: isSelected
                              ? selectedCardBg
                              : 'background.paper',
                            transition: 'all 0.15s',
                            '&:hover': {
                              borderColor: 'primary.main',
                            },
                          }}
                        >
                          <CheckCircle
                            sx={{
                              position: 'absolute',
                              top: 12,
                              right: 12,
                              color: 'primary.main',
                              fontSize: 20,
                              opacity: isSelected ? 1 : 0,
                              transition: 'opacity 0.15s',
                            }}
                          />

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 1,
                              mb: 0.5,
                              pr: 3.5,
                              flexWrap: 'wrap',
                            }}
                          >
                            <Typography
                              variant="body2"
                              fontWeight={600}
                              color={
                                isSelected ? 'primary.main' : 'text.primary'
                              }
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

                          <Box
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
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
                                  py: 0.3,
                                  borderRadius: 1,
                                  border: '1px solid',
                                  borderColor: isSelected
                                    ? alpha(theme.palette.primary.main, 0.3)
                                    : alpha(theme.palette.divider, 1),
                                  bgcolor: isSelected
                                    ? alpha(theme.palette.primary.main, 0.08)
                                    : 'transparent',
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
                            ))}
                          </Box>

                          <Typography
                            variant="caption"
                            sx={{
                              mt: 1,
                              display: 'block',
                              fontFamily: 'monospace',
                              fontSize: '0.65rem',
                              color: isSelected
                                ? 'primary.main'
                                : 'text.disabled',
                              opacity: 0.8,
                            }}
                          >
                            .rosetta/{template.fileName}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
            </>
          )}

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
              disabled={isActionDisabled}
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
                boxShadow: hasSelection
                  ? `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`
                  : 'none',
                transition: 'box-shadow 0.2s',
              }}
            >
              {isCreating ? 'Creating…' : actionLabel}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>

      {/* Override confirmation dialog */}
      <Dialog
        open={!!pendingCreate}
        onClose={() => !isCreating && setPendingCreate(null)}
        fullWidth
        maxWidth="xs"
        PaperProps={{
          sx: {
            borderRadius: 2.5,
            backgroundImage: 'none',
            boxShadow: isDark
              ? '0 24px 48px rgba(0,0,0,0.6)'
              : '0 24px 48px rgba(0,0,0,0.16)',
          },
        }}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <WarningAmber color="warning" />
          Pipeline Already Exists
        </DialogTitle>
        <DialogContent>
          <Typography gutterBottom>
            A pipeline named <strong>{pendingCreate?.fileName}</strong> already
            exists in this project.
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Creating a pipeline with the same name will override the existing
            file. Do you want to continue?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setPendingCreate(null)}
            disabled={isCreating}
            sx={{ minWidth: 90 }}
          >
            Cancel
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleOverride}
            disabled={isCreating}
            startIcon={
              isCreating ? (
                <CircularProgress size={16} color="inherit" />
              ) : (
                <PlayArrow />
              )
            }
            sx={{ minWidth: 110, fontWeight: 600 }}
          >
            {isCreating ? 'Overriding…' : 'Override'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};
