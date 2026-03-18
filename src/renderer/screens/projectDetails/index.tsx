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
  Loader,
  ModelSplitButton,
  NoAiSetModal,
  ProjectDbtSplitButton,
  SplitButton,
  TerminalLayout,
  BusinessModal,
  AiPromptModal,
} from '../../components';
// import { ProjectSidebar } from '../../components/sidebar/project-sidebar';
import { ProjectSidebar } from '../../components/sidebar/project-sidebar';
import { TabManager } from '../../components/editor/tabManager';
import {
  useGetConnectionById,
  useGetConnections,
  useGetFileContentList,
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
  useGitIsInitialized,
  useSaveFileContent,
  useUpdateProject,
} from '../../controllers';
import { projectsServices } from '../../services';
import {
  ButtonsContainer,
  Container,
  Content,
  EditorContainer,
  Header,
  NoFileSelected,
} from './styles';
import {
  useAppContext,
  useDbt,
  useRosettaDBT,
  useTabManager,
} from '../../hooks';
import { Project, SupportedConnectionTypes } from '../../../types/backend';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { AppLayout } from '../../layouts';
import ChatScreen from '../chat';
import { getFileName } from '../../services/settings.services';
import type { EditorTabId } from '../../../types/editor';
import {
  BusinessModelGenerationSchema,
  BusinessModelGenerationSchemaType,
  generateModelsPrompt,
} from '../../helpers/businessModelGenerator';
import { aiProvidersService } from '../../services/aiProviders.service';

const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const {
    isAiProviderSet,
    isChatOpen,
    setEditingFilePath: setSelectedFilePath,
    editingFilePath: selectedFilePath,
    openChatWithMessage,
    registerSyncEditorContent,
  } = useAppContext();

  const { data: project, isLoading, refetch } = useGetSelectedProject();
  const { data: connection } = useGetConnectionById(project?.connectionId);
  const { data: settings } = useGetSettings();
  const { mutate: updateFileContent } = useSaveFileContent();
  const { mutateAsync: getFileContentList } = useGetFileContentList();
  const {
    tabs,
    activeTab,
    activeTabId,
    isHydrated,
    openTab,
    switchTab,
    closeTab,
    closeTabByPath,
    updateTabContent,
    updateTabContentByPath,
    markTabSaved,
    markTabSavedByPath,
    setTabError,
    setTabErrorByPath,
    reorderTabs,
    reset,
    getTabByPath,
    renameTab,
    refreshTabContentByPath,
    // Unsaved changes dialog support
    pendingClose,
    onSaveAndClose,
    onDiscardAndClose,
    onCancelClose,
  } = useTabManager(project?.id);
  const fileContent = activeTab?.content;

  const previousProjectPathRef = React.useRef<string | undefined>();

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
  const [isSynchronizing, setIsSynchronizing] = React.useState(false);

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

  const { data: isInitialized } = useGitIsInitialized(project?.path, {
    enabled: !!project?.path,
  });

  const { data: statuses = [], refetch: updateStatuses } = useGetFileStatuses(
    project?.path,
    { enabled: !!project?.path && !!isInitialized },
  );

  const { data: connections = [] } = useGetConnections();
  const { mutate: updateProject } = useUpdateProject();

  const buildBusinessFilePath = React.useCallback(
    (basePath: string, fileName: string) => {
      const trimmedBase = basePath.replace(/[\\/]+$/, '');
      const separator = basePath.includes('\\') ? '\\' : '/';
      return `${trimmedBase}${separator}${fileName}`;
    },
    [],
  );

  const createOrUpdateBusinessFile = React.useCallback(
    async (basePath: string, fileName: string, content: string) => {
      let filePath = await projectsServices.createFile({
        filePath: basePath,
        name: fileName,
        content,
      });

      const fileAlreadyExisted = !filePath;
      if (!filePath) {
        filePath = buildBusinessFilePath(basePath, fileName);
      }

      let tabId: EditorTabId | null = await openTab(filePath, {
        content,
      });

      if (!tabId) {
        const existingTab = getTabByPath(filePath);
        if (existingTab) {
          tabId = existingTab.id;
        }
      }

      setSelectedFilePath(filePath);

      await fetchDirectories();
      await updateStatuses();

      if (!tabId) {
        const refreshedTab = getTabByPath(filePath);
        if (refreshedTab) {
          tabId = refreshedTab.id;
        }
      }

      if (tabId) {
        updateTabContent(tabId, content, {
          markModified: fileAlreadyExisted,
        });
        if (!fileAlreadyExisted) {
          markTabSaved(tabId);
        }
        setTabError(tabId, undefined);
        switchTab(tabId);
        return true;
      }

      // eslint-disable-next-line no-console
      console.warn('Generated file created but tab could not be opened', {
        filePath,
      });
      toast.error(
        'Generated file created, but the editor tab could not be opened automatically.',
      );
      return false;
    },
    [
      buildBusinessFilePath,
      openTab,
      getTabByPath,
      setSelectedFilePath,
      fetchDirectories,
      updateStatuses,
      updateTabContent,
      markTabSaved,
      setTabError,
      switchTab,
    ],
  );

  const recoverFromFallbackResponse = React.useCallback(
    async (rawResponse: string, basePath: string) => {
      const fenceMatch = rawResponse.match(/```[a-zA-Z]*\n([\s\S]*?)\n```/);
      const rawBody = fenceMatch ? fenceMatch[1] : rawResponse;

      const filenameMatch = rawBody.match(/--\s*filename:\s*([^\n\r]+)\s*/i);
      const inferredFileName = filenameMatch
        ? filenameMatch[1].trim()
        : 'business_model.sql';

      const cleanedSql = filenameMatch
        ? rawBody.replace(filenameMatch[0], '').trim()
        : rawBody.trim();

      if (
        cleanedSql.toLowerCase().includes('select') ||
        cleanedSql.includes('{{')
      ) {
        return createOrUpdateBusinessFile(
          basePath,
          inferredFileName,
          cleanedSql,
        );
      }

      return false;
    },
    [createOrUpdateBusinessFile],
  );

  const processBusinessModelResponse = React.useCallback(
    async (
      response: {
        parsedData?: BusinessModelGenerationSchemaType | null;
        schemaValidation?: {
          errors?: string[] | null;
          originalResponse?: unknown;
        } | null;
        content: unknown;
      },
      basePath: string,
    ) => {
      if (response.parsedData?.fileName && response.parsedData?.content) {
        return createOrUpdateBusinessFile(
          basePath,
          response.parsedData.fileName,
          response.parsedData.content,
        );
      }

      const originalResponse =
        response.schemaValidation?.originalResponse || response.content;

      if (
        typeof originalResponse === 'string' &&
        originalResponse.trim().length > 0
      ) {
        const handled = await recoverFromFallbackResponse(
          originalResponse,
          basePath,
        );
        if (handled) {
          return true;
        }
      }

      const schemaErrors =
        response.schemaValidation?.errors?.filter(Boolean) || [];

      let detailedMessage: string;
      if (schemaErrors.length) {
        detailedMessage = schemaErrors.join('\n');
      } else if (originalResponse) {
        detailedMessage = String(originalResponse);
      } else {
        detailedMessage = 'Provider returned an empty response.';
      }

      toast.error(detailedMessage);
      // eslint-disable-next-line no-console
      console.error('Business model generation failed', {
        schemaErrors,
        originalResponse,
      });

      return false;
    },
    [createOrUpdateBusinessFile, recoverFromFallbackResponse],
  );

  const handleBusinessModalProcess = React.useCallback(
    async (updatedPath: string, query: string, selectedFiles: string[]) => {
      if (selectedFiles.length === 0) {
        return;
      }

      try {
        const files = await getFileContentList(selectedFiles);
        const prompt = generateModelsPrompt(files, query);
        const response =
          await aiProvidersService.generateCompletion<BusinessModelGenerationSchemaType>(
            prompt,
            BusinessModelGenerationSchema,
          );

        const handled = await processBusinessModelResponse(
          response,
          updatedPath,
        );

        if (handled) {
          setBusinessQueryModal(undefined);
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Failed to generate business model';
        toast.error(message);
      }
    },
    [getFileContentList, processBusinessModelResponse, setBusinessQueryModal],
  );

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

  /**
   * Comprehensive synchronization function that coordinates all three components:
   * 1. Git status (file changes, staging, commits)
   * 2. Monaco editor tabs (open files, modified state, content)
   * 3. File explorer (file tree, status indicators)
   */
  const handleSynchronizeAll = React.useCallback(async () => {
    setIsSynchronizing(true);
    try {
      const [statusesResult] = await Promise.all([
        updateStatuses(),
        fetchDirectories(),
      ]);

      const currentStatuses = statusesResult?.data ?? statuses ?? [];

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (!fileStatus) {
          closeTabByPath(tab.path);
        }
      });

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (!fileStatus) {
          markTabSavedByPath(tab.path);
        }
      });

      tabs.forEach((tab) => {
        const fileStatus = currentStatuses.find((s) => s.path === tab.path);
        if (fileStatus?.status === 'modified' && !tab.isModified) {
          refreshTabContentByPath(tab.path);
        }
      });
    } catch (error: any) {
      toast.error(`Sync failed: ${error?.message || 'Unknown error'}`);
      // eslint-disable-next-line no-console
      console.error('Synchronization error:', error);
    } finally {
      setIsSynchronizing(false);
    }
  }, [
    tabs,
    statuses,
    updateStatuses,
    fetchDirectories,
    closeTabByPath,
    markTabSavedByPath,
    refreshTabContentByPath,
  ]);

  React.useEffect(() => {
    const fetchData = async () => {
      if (project && project.path) {
        await fetchDirectories();
      }
    };
    fetchData();
  }, [project]);

  React.useEffect(() => {
    const currentPath = project?.path;
    const previousPath = previousProjectPathRef.current;

    if (currentPath && previousPath && currentPath !== previousPath) {
      reset();
      setSelectedFilePath(undefined);
    }

    previousProjectPathRef.current = currentPath;
  }, [project?.path, reset, setSelectedFilePath]);

  React.useEffect(() => {
    if (!selectedFilePath) {
      return;
    }
    if (!isHydrated) {
      return;
    }

    openTab(selectedFilePath);
  }, [selectedFilePath, openTab, isHydrated]);

  React.useEffect(() => {
    if (activeTab?.path && activeTab.path !== selectedFilePath) {
      setSelectedFilePath(activeTab.path);
      return;
    }
    if (!activeTab?.path && selectedFilePath) {
      setSelectedFilePath(undefined);
    }
  }, [activeTab?.path, selectedFilePath, setSelectedFilePath]);

  React.useEffect(() => {
    const handler = (path: string, content: string) => {
      const targetTab = getTabByPath(path);
      if (!targetTab) {
        return;
      }

      updateTabContentByPath(path, content, {
        markModified: false,
      });
      setTabErrorByPath(path, undefined);
    };

    registerSyncEditorContent?.(handler);

    return () => {
      registerSyncEditorContent?.(undefined);
    };
  }, [
    updateTabContentByPath,
    setTabErrorByPath,
    getTabByPath,
    registerSyncEditorContent,
  ]);

  // Auto-refresh tab content when focusing on a tab
  const previousActiveTabIdRef = React.useRef<EditorTabId | null>(null);
  React.useEffect(() => {
    if (!activeTabId || !activeTab || !isHydrated) {
      return;
    }

    // Only refresh if we actually switched to a different tab
    if (previousActiveTabIdRef.current === activeTabId) {
      return;
    }

    // Skip if tab has unsaved changes
    if (activeTab.isModified) {
      previousActiveTabIdRef.current = activeTabId;
      return;
    }

    // Refresh content from disk when tab becomes active
    refreshTabContentByPath(activeTab.path);
    previousActiveTabIdRef.current = activeTabId;
  }, [activeTabId, activeTab, isHydrated, refreshTabContentByPath]);

  // Auto-refresh config files when connection is updated
  const previousConnectionRef = React.useRef(connection);
  React.useEffect(() => {
    if (!project?.path || !connection || !isHydrated) {
      return;
    }

    const previousConnection = previousConnectionRef.current;

    // Check if connection data actually changed (not just initial load)
    if (previousConnection && previousConnection.id === connection.id) {
      // Connection was updated - refresh config files if they're open
      const configPaths = [
        `${project.path}/profiles.yml`,
        `${project.path}/rosetta/main.conf`,
      ];

      configPaths.forEach((configPath) => {
        const tab = tabs.find((t) => t.path === configPath);
        if (tab && !tab.isModified) {
          // Only refresh if tab is open and has no unsaved changes
          refreshTabContentByPath(configPath);
        }
      });
    }

    previousConnectionRef.current = connection;
    // DO NOT include 'tabs' in dependencies - it would cause infinite loop!
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, project?.path, isHydrated, refreshTabContentByPath]);

  const generateBasicTransformationPrompt = async (
    filePath: string,
    _project: Project,
  ) => {
    const fileName = await getFileName(filePath);
    const tables = await projectsServices.extractSchemaFromModelYaml(_project);
    // If Rosetta model.yaml is missing or empty, notify the user gracefully
    if (!tables || tables.length === 0) {
      const modelName = fileName.replace(/\.sql$/i, '');
      const { schema, table } = utils.extractSchemaAndTable(fileName);
      const expectedModel = schema && table ? `${schema}.${table}` : modelName;
      toast.info(
        `AI context incomplete: database schema missing. Run Rosetta → Raw layer to generate rosetta/${_project.name}/model.yaml (should include "${expectedModel}"). Then try again.`,
      );
    }
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

  const generateDashboards = async () => {
    if (!isAiProviderSet) {
      toast.error('AI API Key not provided');
      return;
    }

    if (!selectedFilePath || !fileContent) {
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
      openChatWithMessage(prompt);
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
        name: 'Determine Incremental & Unique Key Columns',
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
        <ProjectSidebar
          directories={directories}
          statuses={statuses}
          isLoadingDirectories={isLoadingDirectories}
          selectedFilePath={selectedFilePath}
          project={project}
          onDeleteFile={(deletedFile: string) => {
            closeTabByPath(deletedFile);
            if (selectedFilePath?.includes(deletedFile)) {
              setSelectedFilePath(undefined);
            }
          }}
          onFileSelect={async (fileNode) => {
            if (!utils.isEditableFile(fileNode.path)) {
              setSelectedFilePath(fileNode.path);
              openTab(fileNode.path, { isReadOnly: true });
              return;
            }
            setSelectedFilePath(fileNode.path);
            openTab(fileNode.path);
          }}
          onRefreshFiles={async () => {
            await fetchDirectories();
            await updateStatuses();
          }}
          onCopyPath={async (source, target) => {
            await projectsServices.copyPath({
              source,
              target,
            });
            await fetchDirectories();
            await updateStatuses();
          }}
          onNewFile={(filePath) => {
            if (!filePath) {
              return;
            }
            setSelectedFilePath(filePath);
            openTab(filePath);
          }}
          onRenameFile={(oldPath, newPath) => {
            renameTab(oldPath, newPath);
            if (activeTab?.path === oldPath || selectedFilePath === oldPath) {
              setSelectedFilePath(newPath);
            }
          }}
          // Source Control Monaco Editor Integration
          onSourceControlOpenFile={(filePath: string) => {
            setSelectedFilePath(filePath);
            openTab(filePath);
          }}
          onSourceControlFileSelect={(filePath: string) => {
            setSelectedFilePath(filePath);
          }}
          onSourceControlRefreshFileContent={refreshTabContentByPath}
          // Synchronization
          onSourceControlSynchronize={handleSynchronizeAll}
          isSourceControlSynchronizing={isSynchronizing}
        />
      }
    >
      <Box display="flex" flexDirection="row" width="100%" height="100%">
        <Box flex={1}>
          <Container>
            <TerminalLayout project={project}>
              <Content>
                <EditorContainer>
                  <Header>
                    <Box display="flex" flex={1} minWidth={0}>
                      <TabManager
                        tabs={tabs}
                        activeTabId={activeTabId}
                        onSelect={switchTab}
                        onClose={closeTab}
                        onReorder={reorderTabs}
                      />
                    </Box>
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
                            environment={settings?.env}
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
                        environment={settings?.env}
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
                  {project.path && (
                    <Editor
                      projectId={project.id}
                      projectPath={project.path}
                      tabs={tabs}
                      activeTabId={activeTabId}
                      onTabContentChange={(tabId, newContent) => {
                        updateTabContent(tabId, newContent, {
                          markModified: true,
                        });
                      }}
                      onTabSaved={(tabId) => {
                        markTabSaved(tabId);
                      }}
                      onTabError={(tabId, errorMessage) => {
                        setTabError(tabId, errorMessage);
                      }}
                      pendingClose={pendingClose}
                      onSaveAndClose={onSaveAndClose}
                      onDiscardAndClose={onDiscardAndClose}
                      onCancelClose={onCancelClose}
                      onGitStatusRefresh={updateStatuses}
                      onOpenFile={(filePath: string) => {
                        setSelectedFilePath(filePath);
                        openTab(filePath);
                      }}
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
                processCallback={handleBusinessModalProcess}
              />
            )}
            {noAiSetModal && (
              <NoAiSetModal
                isOpen={noAiSetModal}
                onClose={() => setNoAiSetModal(false)}
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
                  if (selectedFilePath) {
                    updateTabContentByPath(selectedFilePath, value, {
                      markModified: false,
                    });
                    markTabSavedByPath(selectedFilePath);
                    setTabErrorByPath(selectedFilePath, undefined);
                  } else {
                    toast.error('No file selected');
                  }
                  updateFileContent({
                    path: String(selectedFilePath),
                    content: value,
                  });
                  toast.success('Content saved!');
                }}
                prompt={aiTransformationPrompt}
                onPromptChange={(value) => setAiTransformationPrompt(value)}
                onSubmit={async () => {
                  openChatWithMessage(aiTransformationPrompt);
                  setAiTransformationPrompt(undefined);
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
