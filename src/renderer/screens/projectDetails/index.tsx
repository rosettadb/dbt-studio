import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import {
  AutoAwesome,
  AutoFixHigh,
  Cable,
  Delete,
  Edit,
} from '@mui/icons-material';
import {
  Box,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Slide,
  Tooltip,
} from '@mui/material';
import { toast } from 'react-toastify';
import yaml from 'js-yaml';
import {
  AddConnectionModal,
  Editor,
  FileTreeViewer,
  GenerateAiQueriesModal,
  Loader,
  ModelSplitButton,
  NoAiSetModal,
  ProjectDbtSplitButton,
  SplitButton,
  TerminalLayout,
  BusinessModal,
  AiPromptModal,
} from '../../components';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileContent,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
  useSaveFileContent,
  useUpdateProject,
} from '../../controllers';
import { projectsServices } from '../../services';
import {
  ButtonsContainer,
  Container,
  Content,
  EditorContainer,
  FileTreeContainer,
  Header,
  NoFileSelected,
  SelectedFile,
} from './styles';
import { useDbt, useRosettaDBT } from '../../hooks';
import {
  Command,
  CommandType,
  GenerateDashboardResponseType,
  Project,
  SupportedConnectionTypes,
} from '../../../types/backend';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { AppLayout } from '../../layouts';
import { AppContext } from '../../context';
import ChatScreen from '../chat';
import { getFileName } from '../../services/settings.services';

const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>();

  const { data: project, isLoading, refetch } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(project?.connectionId);
  const { data: settings } = useGetSettings();
  const { mutate: updateFileContent } = useSaveFileContent();
  const { data: fileContent } = useGetFileContent(selectedFilePath);

  const { isAiProviderSet, isChatOpen } = React.useContext(AppContext);
  const [queryData, setQueryData] = React.useState<
    GenerateDashboardResponseType[]
  >([]);
  const [isQueryOpen, setIsQueryOpen] = React.useState(false);
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false);
  const [businessQueryModal, setBusinessQueryModal] = React.useState<string>();
  const [noAiSetModal, setNoAiSetModal] = React.useState(false);
  const [aiTransformationPrompt, setAiTransformationPrompt] =
    React.useState<string>();
  const [isAddConnectionModalOpen, setIsAddConnectionModalOpen] =
    React.useState(false);
  const [connectionMenuAnchor, setConnectionMenuAnchor] =
    React.useState<HTMLElement | null>(null);
  const [aiTransformationResponse, setAitTransformationResponse] =
    React.useState<string>();

  const {
    data: directories,
    isLoading: isLoadingDirectories,
    refetch: fetchDirectories,
  } = useGetProjectFiles(project as Project, { enabled: !!project?.id });

  const { fn: rosettaDbt, isRunning: isRunningRosettaDbt } = useRosettaDBT(
    async () => {
      if (project) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2000);
        });
        await fetchDirectories();
      }
    },
  );

  const { isRunning: isRunningDbt } = useDbt(async () => {
    await fetchDirectories();
  });

  const { data: statuses = [], refetch: updateStatuses } = useGetFileStatuses(
    project?.path ?? '',
    { enabled: !!project?.path },
  );

  const { data: connections = [] } = useGetConnections();
  const { mutate: updateProject } = useUpdateProject();

  const handleAddConnection = () => {
    setIsAddConnectionModalOpen(true);
  };

  const handleConnectionModalClose = () => {
    setIsAddConnectionModalOpen(false);
  };

  const handleRemoveConnection = () => {
    if (project) {
      updateProject({
        ...project,
        connectionId: undefined,
      });
      setSelectedFilePath(undefined);
      toast.success('Connection removed from project successfully!');
    }
    setConnectionMenuAnchor(null);
  };

  const handleConnectionMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setConnectionMenuAnchor(event.currentTarget);
  };

  const handleConnectionMenuClose = () => {
    setConnectionMenuAnchor(null);
  };

  React.useEffect(() => {
    const fetchData = async () => {
      if (project && project.path) {
        await fetchDirectories();
      }
    };
    fetchData();
  }, [project]);

  const generateBasicTransformationPrompt = async (
    filePath: string,
    _project: Project,
  ) => {
    const fileName = await getFileName(filePath);
    const tables = await projectsServices.extractSchemaFromModelYaml(_project);
    const { schema, table } = utils.extractSchemaAndTable(fileName);

    const tableStructure = tables.find(
      (tmpTable) => tmpTable.name === table && tmpTable.schema === schema,
    );

    if (!tableStructure) {
      const prompt = utils.format(
        AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITHOUT_TABLE,
        fileName,
        String(fileContent),
        String(project?.dbtConnection?.type),
      );
      setAiTransformationPrompt(prompt);
      return;
    }

    const promptTable = yaml.dump({
      name: tableStructure.name,
      type: tableStructure.type,
      schema: tableStructure.schema,
      columns: tableStructure.columns.map((col) => ({
        name: col.name,
        typeName: col.typeName,
      })),
    });

    const tableName = `${schema}.${table}`;

    const prompt = utils.format(
      AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITH_TABLE,
      tableName,
      promptTable,
      fileName,
      String(fileContent),
      String(project?.dbtConnection?.type),
    );
    setAiTransformationPrompt(prompt);
  };

  const generateEnhancedTransformationPrompt = (
    content: string,
    connectionType: SupportedConnectionTypes,
  ) => {
    const prompt = utils.format(
      AI_PROMPTS.ENHANCE_ENHANCED_MODEL,
      connectionType,
      content,
    );
    setAiTransformationPrompt(prompt);
  };

  const enhanceModel = async (prompt: string) => {
    const response = await projectsServices.enhanceModelQuery(
      `${prompt}\n\nMAKE SURE THE OUTPUT IS AGAIN A DBT MODEL`,
    );
    setAitTransformationResponse(response.content);
  };

  const generateDashboards = async () => {
    if (!isAiProviderSet) {
      toast.error('Open AI API Key not provided');
      return;
    }

    if (!selectedFilePath) {
      toast.error('No file selected');
      return;
    }

    setIsLoadingQuery(true);
    const fileName = await getFileName(selectedFilePath);

    try {
      const prompt = utils.format(
        AI_PROMPTS.GENERATE_DASHBOARDS,
        fileName,
        String(project?.dbtConnection?.type),
        String(fileContent),
      );

      const response = await projectsServices.generateDashboardQuery(prompt);
      setQueryData(response);
      setIsQueryOpen(true);
    } catch (error: any) {
      if (
        typeof error?.message === 'string' &&
        (error.message.includes('429') || error.message.includes('quota'))
      ) {
        toast.error(
          'OpenAI API quota exceeded. Please check your billing details.',
        );
      } else {
        toast.error(
          `Error generating dashboards: ${error?.message || 'Unknown error'}`,
        );
      }
    } finally {
      setIsLoadingQuery(false);
    }
  };

  const menuItems = React.useMemo(() => {
    if (
      !project ||
      !selectedFilePath ||
      !fileContent ||
      !selectedFilePath.endsWith('.sql')
    ) {
      return [];
    }
    const items = [
      {
        name: 'Suggest Basic Transformations',
        onClick: () => {
          if (isAiProviderSet) {
            generateBasicTransformationPrompt(selectedFilePath, project!);
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      },
      {
        name: 'Generate Analytics',
        onClick: () => {
          if (isAiProviderSet) {
            generateDashboards();
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      },
    ];
    if (
      project.incrementalDir &&
      project.connection?.type &&
      selectedFilePath.includes(project?.incrementalDir)
    ) {
      items.push({
        name: 'Auto-Fix Incremental & Unique Key Columns',
        onClick: () => {
          if (isAiProviderSet) {
            generateEnhancedTransformationPrompt(
              fileContent,
              project?.connection?.type!,
            );
            return;
          }
          setNoAiSetModal(true);
        },
        subTitle: '',
        leftIcon: <AutoFixHigh />,
      });
    }
    return items;
  }, [selectedFilePath, fileContent]);

  if (isLoading) {
    return <Loader />;
  }

  if (!project?.id) {
    return <Navigate to="/app/select-project" />;
  }

  const handleBusinessLayerClick = (path: string) => {
    if (isAiProviderSet) {
      setBusinessQueryModal(path);
    } else {
      setNoAiSetModal(true);
    }
  };

  return (
    <AppLayout
      sidebarContent={
        <FileTreeContainer>
          {directories && (
            <FileTreeViewer
              statuses={statuses}
              node={directories}
              onDeleteFileCallback={(deletedFile: string) => {
                if (selectedFilePath?.includes(deletedFile)) {
                  setSelectedFilePath(undefined);
                }
              }}
              onFileSelect={async (fileNode) => {
                if (!utils.isEditableFile(fileNode.path)) {
                  setSelectedFilePath(fileNode.path);
                  return;
                }
                setSelectedFilePath(fileNode.path);
              }}
              isLoadingFiles={isLoadingDirectories}
              refreshFiles={async () => {
                await fetchDirectories();
                await updateStatuses();
              }}
              copyPath={async (source, target) => {
                await projectsServices.copyPath({
                  source,
                  target,
                });
                await fetchDirectories();
                await updateStatuses();
              }}
            />
          )}
        </FileTreeContainer>
      }
    >
      <Box display="flex" flexDirection="row" width="100%" height="100%">
        <Box flex={1}>
          <Container>
            <TerminalLayout project={project}>
              <Content>
                <EditorContainer>
                  <Header>
                    {selectedFilePath && (
                      <SelectedFile>
                        {utils.splitPath(selectedFilePath ?? '', project.name)}
                      </SelectedFile>
                    )}
                    <ButtonsContainer>
                      {menuItems.length > 0 && (
                        <SplitButton
                          title="AI"
                          isLoading={isLoadingQuery}
                          leftIcon={<AutoAwesome />}
                          menuItems={menuItems}
                        />
                      )}
                      {selectedFilePath?.endsWith('.sql') &&
                        selectedFilePath?.includes('models') &&
                        project && (
                          <ModelSplitButton
                            modelPath={selectedFilePath}
                            project={project}
                            isDbtConfigured={!!settings?.dbtPath}
                            fileContent={fileContent}
                            isRunningDbt={isRunningDbt}
                            isRunningRosettaDbt={isRunningRosettaDbt}
                          />
                        )}
                      <ProjectDbtSplitButton
                        rosettaPath={settings?.rosettaPath}
                        dbtPath={settings?.dbtPath}
                        project={project}
                        isDbtConfigured={!!settings?.dbtPath}
                        isRunningDbt={isRunningDbt}
                        isRunningRosettaDbt={isRunningRosettaDbt}
                        connection={connection}
                        rosettaDbt={rosettaDbt}
                        handleBusinessLayerClick={handleBusinessLayerClick}
                      />
                      {connection?.id ? (
                        <>
                          <Tooltip
                            title="Database connection options"
                            placement="bottom"
                          >
                            <IconButton onClick={handleConnectionMenuOpen}>
                              <Cable color="primary" fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Menu
                            anchorEl={connectionMenuAnchor}
                            open={Boolean(connectionMenuAnchor)}
                            onClose={handleConnectionMenuClose}
                            anchorOrigin={{
                              vertical: 'bottom',
                              horizontal: 'right',
                            }}
                            transformOrigin={{
                              vertical: 'top',
                              horizontal: 'right',
                            }}
                          >
                            <MenuItem
                              onClick={() => {
                                navigate(
                                  `/app/edit-connection/${connection.id}`,
                                );
                                handleConnectionMenuClose();
                              }}
                            >
                              <ListItemIcon>
                                <Edit fontSize="small" color="primary" />
                              </ListItemIcon>
                              <ListItemText>Edit</ListItemText>
                            </MenuItem>
                            <MenuItem onClick={handleRemoveConnection}>
                              <ListItemIcon>
                                <Delete fontSize="small" color="error" />
                              </ListItemIcon>
                              <ListItemText>Remove</ListItemText>
                            </MenuItem>
                          </Menu>
                        </>
                      ) : (
                        <Tooltip
                          title="Add database connection"
                          placement="bottom"
                        >
                          <IconButton
                            onClick={handleAddConnection}
                            sx={{
                              border: '1px solid',
                              borderColor: 'divider',
                              borderRadius: '16px',
                              padding: '4px 12px',
                              fontSize: '12px',
                              color: 'text.secondary',
                              '&:hover': {
                                bgcolor: 'action.hover',
                              },
                            }}
                          >
                            <Cable fontSize="small" sx={{ mr: 0.5 }} />
                            No connection
                          </IconButton>
                        </Tooltip>
                      )}
                    </ButtonsContainer>
                  </Header>
                  {!selectedFilePath && (
                    <NoFileSelected>
                      Please select a file from the explorer on the left!
                    </NoFileSelected>
                  )}
                  {selectedFilePath && fileContent && project.path && (
                    <Editor
                      projectPath={project.path}
                      filePath={selectedFilePath}
                      content={fileContent}
                    />
                  )}
                </EditorContainer>
              </Content>
            </TerminalLayout>

            {businessQueryModal && (
              <BusinessModal
                isOpen={!!businessQueryModal}
                project={project}
                path={businessQueryModal}
                onClose={() => setBusinessQueryModal(undefined)}
                processCallback={async (updatedPath, query, selectedFiles) => {
                  const args = new Map([
                    ['-o', updatedPath],
                    ['-q', `"${query}"`],
                  ]);
                  if (selectedFiles.length > 0) {
                    let command = '';
                    selectedFiles.forEach((file) => {
                      command += `-i "${file}" `;
                    });
                    args.set(' ', command);
                  }
                  await rosettaDbt(project, {
                    command: 'business',
                    commandType: CommandType.DBTNext,
                    arguments: args,
                  } as Command);
                  setBusinessQueryModal(undefined);
                }}
              />
            )}
            {noAiSetModal && (
              <NoAiSetModal
                isOpen={noAiSetModal}
                onClose={() => setNoAiSetModal(false)}
              />
            )}
            {isQueryOpen && (
              <GenerateAiQueriesModal
                isOpen={isQueryOpen}
                onClose={() => setIsQueryOpen(false)}
                data={queryData}
              />
            )}
            {aiTransformationPrompt && (
              <AiPromptModal
                isOpen={!!aiTransformationPrompt}
                onClose={() => {
                  setAiTransformationPrompt(undefined);
                  setAitTransformationResponse(undefined);
                }}
                onApply={async (value) => {
                  updateFileContent({
                    path: String(selectedFilePath),
                    content: value,
                  });
                  toast.success('Content saved!');
                }}
                prompt={aiTransformationPrompt}
                onPromptChange={(value) => setAiTransformationPrompt(value)}
                onSubmit={async () => {
                  await enhanceModel(String(aiTransformationPrompt));
                }}
                response={aiTransformationResponse}
              />
            )}
            <AddConnectionModal
              isOpen={isAddConnectionModalOpen}
              onClose={handleConnectionModalClose}
              project={project || null}
              connections={connections}
              onSuccess={() => {
                // Refresh the project data
                setSelectedFilePath(undefined);
                refetch();
              }}
              onUpdateProject={updateProject}
            />
          </Container>
        </Box>
        <Box
          sx={{
            width: isChatOpen ? '400px' : 0,
            transition: 'width 200ms ease',
            borderLeft: isChatOpen ? '1px solid' : 'none',
            borderColor: 'divider',
            overflow: 'hidden',
          }}
        >
          <Slide in={isChatOpen} direction="left" mountOnEnter unmountOnExit>
            <Box height="100%">
              <ChatScreen />
            </Box>
          </Slide>
        </Box>
      </Box>
    </AppLayout>
  );
};

export default ProjectDetails;
