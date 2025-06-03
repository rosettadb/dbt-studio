import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { AutoAwesome, Cable } from '@mui/icons-material';
import { IconButton, Tooltip } from '@mui/material';
import { toast } from 'react-toastify';
import yaml from 'js-yaml';
import {
  BusinessQueryModal,
  Editor,
  FileTreeViewer,
  GenerateAiQueriesModal,
  Loader,
  TerminalLayout,
  SplitButton,
  Icon,
} from '../../components';
import {
  useGetFileStatuses,
  useGetProjectFiles,
  useGetSelectedProject,
  useGetSettings,
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
import { GenerateDashboardResponseType, Project } from '../../../types/backend';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { AppLayout } from '../../layouts';
import { icons } from '../../../../assets';

const ProjectDetails: React.FC = () => {
  const navigate = useNavigate();
  const { data: project, isLoading } = useGetSelectedProject();
  const { data: settings } = useGetSettings();
  const [queryData, setQueryData] = React.useState<
    GenerateDashboardResponseType[]
  >([]);
  const [isQueryOpen, setIsQueryOpen] = React.useState(false);
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false);
  const [selectedFilePath, setSelectedFilePath] = React.useState<string>();
  const [fileContent, setFileContent] = React.useState<string>();
  const [businessQueryModal, setBusinessQueryModal] = React.useState(false);

  const {
    data: directories,
    isLoading: isLoadingDirectories,
    refetch: fetchDirectories,
  } = useGetProjectFiles(project, { enabled: !!project });

  const { fn: rosettaDbt, isRunning: isRunningRosettaDbt } = useRosettaDBT(
    async () => {
      if (project) {
        await projectsServices.postRosettaDBTCopy(project);
        await fetchDirectories();
      }
    },
  );

  const {
    run: dbtRun,
    test: dbtTest,
    compile: dbtCompile,
    debug: dbtDebug,
    docsGenerate: dbtDocsGenerate,
    docsServe: dbtDocsServe,
    isRunning: isRunningDbt,
  } = useDbt(async () => {
    await fetchDirectories();
  });

  const { data: statuses = [], refetch: updateStatuses } = useGetFileStatuses(
    project?.path ?? '',
    { enabled: !!project?.path }
  );

  React.useEffect(() => {
    const fetchData = async () => {
      if (project && project.path) {
        await fetchDirectories();
      }
    };
    fetchData();
  }, [project]);

  const isDbtConfigured = React.useMemo(() => {
    return settings?.dbtPath && settings.dbtPath.trim() !== '';
  }, [settings?.dbtPath]);

  const enhanceModel = async () => {
    if (!settings?.openAIApiKey || settings.openAIApiKey === '') {
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
    if (!settings?.openAIApiKey || settings.openAIApiKey === '') {
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
    if (!settings?.openAIApiKey || settings.openAIApiKey === '') {
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

  // Early return for loading state
  if (isLoading) {
    return <Loader />;
  }

  // Early return for no project
  if (!project) {
    return <Navigate to="/app/select-project" />;
  }

  // Early return for missing connection
  if (project?.id && !project?.rosettaConnection) {
    return <Navigate to="/app/add-connection/" />;
  }

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
                const content = await projectsServices.getFileContent({
                  path: fileNode.path,
                });
                setSelectedFilePath(fileNode.path);
                setFileContent(content);
              }}
              onDbtRun={async (fileNode) => {
                let filePath = fileNode.path;
                const modelsPathIndex = filePath.indexOf(
                  `${project?.name}/models/`,
                );
                if (modelsPathIndex !== -1) {
                  filePath = filePath.slice(
                    modelsPathIndex + `${project?.name}/models/`.length,
                  );
                }
                if (filePath.endsWith('.sql')) {
                  filePath = filePath.slice(0, -4);
                }
                await dbtRun(project, filePath);
              }}
              onDbtTest={async (fileNode) => {
                let filePath = fileNode.path;
                const modelsPathIndex = filePath.indexOf(
                  `${project?.name}/models/`,
                );
                if (modelsPathIndex !== -1) {
                  filePath = filePath.slice(
                    modelsPathIndex + `${project?.name}/models/`.length,
                  );
                }
                if (filePath.endsWith('.yaml')) {
                  filePath = filePath.slice(0, -5);
                }
                await dbtTest(project, filePath);
              }}
              isLoadingFiles={isLoadingDirectories}
              refreshFiles={async () => {
                await fetchDirectories();
                await updateStatuses();
              }}
            />
          )}
        </FileTreeContainer>
      }
    >
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
                  <SplitButton
                    title="RosettaDB"
                    disabled={false}
                    isLoading={isRunningRosettaDbt || isRunningDbt}
                    leftIcon={
                      <img
                        src={icons.rosetta}
                        alt="Rosetta"
                        width={18}
                        height={18}
                        style={{
                          display: 'inline-block',
                          objectFit: 'contain',
                        }}
                      />
                    }
                    menuItems={[
                      {
                        name: 'Generate dbt Staging Layer',
                        onClick: () => rosettaDbt(project, ''),
                        subTitle:
                          'Generate dbt Staging Layer (runs extract first)',
                      },
                      {
                        name: 'Generate dbt Incremental/Enhanced Layer',
                        onClick: () => rosettaDbt(project, '--incremental'),
                        subTitle: 'Generate dbt Incremental Layer',
                      },
                      {
                        name: 'Generate dbt Business Layer',
                        onClick: () => setBusinessQueryModal(true),
                        subTitle: 'Generate dbt Business Layer',
                      },
                    ]}
                  />
                  <SplitButton
                    title="dbt"
                    toltipTitle={
                      isDbtConfigured
                        ? ''
                        : 'Please configure dbt path in settings'
                    }
                    disabled={!isDbtConfigured}
                    isLoading={isRunningDbt}
                    leftIcon={<Icon src={icons.dbtTm} width={16} height={16} />}
                    menuItems={[
                      {
                        name: 'Run',
                        onClick: () => dbtRun(project),
                        subTitle: 'Run the dbt project',
                      },
                      {
                        name: 'Test',
                        onClick: () => dbtTest(project),
                        subTitle: 'Run the dbt test',
                      },
                      {
                        name: 'Compile',
                        onClick: () => dbtCompile(project),
                        subTitle: 'Compile the dbt project',
                      },
                      {
                        name: 'Debug',
                        onClick: () => dbtDebug(project),
                        subTitle: 'Debug dbt connections and project',
                      },
                      {
                        name: 'Generate Docs',
                        onClick: () => dbtDocsGenerate(project),
                        subTitle: 'Generate documentation for the project',
                      },
                      {
                        name: 'Serve Docs',
                        onClick: () => dbtDocsServe(project),
                        subTitle: 'Serve the documentation website',
                      },
                    ]}
                  />
                  {selectedFilePath?.includes(
                    `${project.path}/models/enhanced`,
                  ) && (
                    <SplitButton
                      title="AI Assistant"
                      toltipTitle={
                        !settings?.openAIApiKey || settings.openAIApiKey === ''
                          ? 'Open AI Api key must be added'
                          : ''
                      }
                      disabled={!settings?.openAIApiKey}
                      isLoading={isLoadingQuery}
                      leftIcon={<AutoAwesome />}
                      menuItems={[
                        {
                          name: 'Auto-Fix Incremental & Unique Key Columns',
                          onClick: enhanceModel,
                          subTitle: '',
                        },
                      ]}
                    />
                  )}
                  {selectedFilePath?.includes(
                    `${project.path}/models/staging`,
                  ) && (
                    <SplitButton
                      title="AI Assistant"
                      disabled={!settings?.openAIApiKey}
                      isLoading={isLoadingQuery}
                      menuItems={[
                        {
                          name: 'Suggest Basic Transformations',
                          onClick: enhanceStagingModel,
                          subTitle: '',
                        },
                      ]}
                    />
                  )}
                  {selectedFilePath?.includes(
                    `${project.path}/models/business`,
                  ) && (
                    <SplitButton
                      title="AI Assistant"
                      disabled={!settings?.openAIApiKey}
                      isLoading={isLoadingQuery}
                      menuItems={[
                        {
                          name: 'Generate Dashboards',
                          onClick: generateDashboards,
                          subTitle: '',
                        },
                      ]}
                    />
                  )}
                  <Tooltip title="Edit database connection" placement="bottom">
                    <IconButton
                      onClick={() => navigate('/app/edit-connection')}
                    >
                      <Cable color="primary" fontSize="small" />
                    </IconButton>
                  </Tooltip>
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
          <BusinessQueryModal
            isOpen={businessQueryModal}
            onClose={() => setBusinessQueryModal(false)}
            onSubmit={(query) =>
              rosettaDbt(project, `--business -q "${query}"`)
            }
          />
        )}
        {isQueryOpen && (
          <GenerateAiQueriesModal
            isOpen={isQueryOpen}
            onClose={() => setIsQueryOpen(false)}
            data={queryData}
          />
        )}
      </Container>
    </AppLayout>
  );
};

export default ProjectDetails;
