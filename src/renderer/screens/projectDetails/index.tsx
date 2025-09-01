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
  Tooltip,
  Slide,
} from '@mui/material';
import { toast } from 'react-toastify';
import yaml from 'js-yaml';
import {
  AddConnectionModal,
  Editor,
  FileTreeViewer,
  GenerateAiQueriesModal,
  Loader,
  TerminalLayout,
  SplitButton,
  NoAiSetModal,
  ModelSplitButton,
  ProjectDbtSplitButton,
} from '../../components';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
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
import { useRosettaDBT, useDbt } from '../../hooks';
import {
  GenerateDashboardResponseType,
  Project,
  Command,
  CommandType,
} from '../../../types/backend';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { AppLayout } from '../../layouts';
import { AppContext } from '../../context';
import { BusinessModal } from '../../components/modals/businessModal';
import ChatScreen from '../chat';

const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const { data: project, isLoading, refetch } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(project?.connectionId);
  const { data: settings } = useGetSettings();
  const { isAiProviderSet, isChatOpen } = React.useContext(AppContext);
  const [queryData, setQueryData] = React.useState<
    GenerateDashboardResponseType[]
  >([]);
  const [isQueryOpen, setIsQueryOpen] = React.useState(false);
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>();
  const [fileContent, setFileContent] = React.useState<string>();
  const [businessQueryModal, setBusinessQueryModal] = React.useState<string>();
  const [noAiSetModal, setNoAiSetModal] = React.useState(false);
  const [isAddConnectionModalOpen, setIsAddConnectionModalOpen] =
    React.useState(false);
  const [connectionMenuAnchor, setConnectionMenuAnchor] =
    React.useState<HTMLElement | null>(null);

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

  const enhanceModel = async () => {
    if (!isAiProviderSet) {
      toast.error('Open AI API Key not provided');
      return;
    }

    if (!selectedFilePath) {
      toast.error('No file selected');
      return;
    }

    setIsLoadingQuery(true);

    try {
      const response = await projectsServices.enhanceModelQuery(
        utils.format(
          AI_PROMPTS.ENHANCE_ENHANCED_MODEL,
          String(project?.dbtConnection?.type),
          String(fileContent),
        ),
      );
      await projectsServices.saveFileContent({
        path: selectedFilePath,
        content: response.content,
      });
      setFileContent(response.content);
      toast.success('Model enhanced successfully');
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
          `Error enhancing model: ${error?.message || 'Unknown error'}`,
        );
      }
    } finally {
      setIsLoadingQuery(false);
    }
  };

  const enhanceStagingModel = async () => {
    if (!isAiProviderSet) {
      toast.error('Open AI API Key not provided');
      return;
    }

    if (!selectedFilePath) {
      toast.error('No file selected');
      return;
    }

    if (!project) {
      toast.error('Project not found');
      return;
    }

    setIsLoadingQuery(true);

    try {
      const fileName = utils.getFileName(selectedFilePath, false);
      const tables = await projectsServices.extractSchemaFromModelYaml(project);
      const { schema, table } = utils.extractSchemaAndTable(fileName);

      const tableStructure = tables.find(
        (tmpTable) => tmpTable.name === table && tmpTable.schema === schema,
      );

      if (!tableStructure) {
        toast.info(`Could not find table: ${schema}.${table}`);
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
        AI_PROMPTS.ENHANCE_STAGING_MODEL,
        tableName,
        promptTable,
        fileName,
        String(fileContent),
        String(project?.dbtConnection?.type),
      );

      const response = await projectsServices.enhanceModelQuery(prompt);
      await projectsServices.saveFileContent({
        path: selectedFilePath,
        content: response.content,
      });

      setFileContent(response.content);
      toast.success('Staging model enhanced successfully');
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
          `Error enhancing staging model: ${error?.message || 'Unknown error'}`,
        );
      }
    } finally {
      setIsLoadingQuery(false);
    }
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

    try {
      const prompt = utils.format(
        AI_PROMPTS.GENERATE_DASHBOARDS,
        utils.getFileName(selectedFilePath, false),
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

  if (isLoading) {
    return <Loader />;
  }

  if (!project?.id) {
    return <Navigate to="/app/select-project" />;
  }

  // if (project?.id && !project?.connectionId) {
  //   return <Navigate to={`/app/add-connection/${project.id}`} />;
  // }

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
                // Check if file is editable before trying to read its content
                if (!utils.isEditableFile(fileNode.path)) {
                  setSelectedFilePath(fileNode.path);
                  setFileContent(
                    utils.getNonEditableFileMessage(fileNode.path),
                  );
                  return;
                }

                // For editable files, load content normally
                const content = await projectsServices.getFileContent({
                  path: fileNode.path,
                });
                setSelectedFilePath(fileNode.path);
                setFileContent(content);
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
                      {/* Single model command buttons - only for .sql files */}
                      {selectedFilePath?.endsWith('.sql') &&
                        selectedFilePath?.includes('/models/') &&
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
                      {selectedFilePath?.includes(
                        `${project.path}/models/enhanced`,
                      ) && (
                        <SplitButton
                          title="AI"
                          isLoading={isLoadingQuery}
                          leftIcon={<AutoAwesome />}
                          menuItems={[
                            {
                              name: 'Auto-Fix Incremental & Unique Key Columns',
                              onClick: isAiProviderSet
                                ? enhanceModel
                                : () => setNoAiSetModal(true),
                              subTitle: '',
                              leftIcon: <AutoFixHigh />,
                            },
                          ]}
                        />
                      )}
                      {selectedFilePath?.includes(
                        `${project.path}/models/staging`,
                      ) && (
                        <SplitButton
                          title="AI"
                          isLoading={isLoadingQuery}
                          leftIcon={<AutoAwesome />}
                          menuItems={[
                            {
                              name: 'Suggest Basic Transformations',
                              onClick: isAiProviderSet
                                ? enhanceStagingModel
                                : () => setNoAiSetModal(true),
                              subTitle: '',
                              leftIcon: <AutoFixHigh />,
                            },
                          ]}
                        />
                      )}
                      {selectedFilePath?.includes(
                        `${project.path}/models/business`,
                      ) && (
                        <SplitButton
                          title="AI"
                          isLoading={isLoadingQuery}
                          menuItems={[
                            {
                              name: 'Generate Analytics',
                              onClick: isAiProviderSet
                                ? generateDashboards
                                : () => setNoAiSetModal(true),
                              subTitle: '',
                              leftIcon: <AutoFixHigh />,
                            },
                          ]}
                        />
                      )}
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
                  {selectedFilePath && (
                    <Editor
                      filePath={selectedFilePath}
                      content={fileContent ?? ''}
                      setContent={setFileContent}
                      enableDiff
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
