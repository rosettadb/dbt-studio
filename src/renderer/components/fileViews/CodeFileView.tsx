import React from 'react';
import { AutoAwesome, AutoFixHigh } from '@mui/icons-material';
import { toast } from 'react-toastify';
import yaml from 'js-yaml';
import { Editor } from '../editor';
import { SplitButton } from '../splitButton';
import { ModelSplitButton } from '../dbtModelButtons';
import { AiPromptModal, NoAiSetModal } from '../modals';
import { useTabs } from '../../context/TabsProvider';
import { useQueryResults } from '../../context/QueryResultsProvider';
import { useAppContext } from '../../hooks';
import { useRefreshProjectFiles } from '../../hooks/useRefreshProjectFiles';
import { useGetSettings, useSaveFileContent } from '../../controllers';
import { projectsServices } from '../../services';
import { AI_PROMPTS } from '../../config/constants';
import { utils } from '../../helpers';
import { path as nodePath } from '../../lib/path';
import type { SupportedConnectionTypes } from '../../../types/backend';
import type { FileViewDefinition, FileViewProps } from './types';

type EditorTabsProps = Pick<FileViewProps, 'project'>;

// Monaco over the whole tab list (one model per tab, the active one shown).
// Exported separately so the empty-workspace state can still mount the
// drag-and-drop target without an active tab.
export const EditorTabs: React.FC<EditorTabsProps> = ({ project }) => {
  const {
    tabs,
    activeTabId,
    activeTab,
    updateTabContent,
    markTabSaved,
    setTabError,
    openFile,
    togglePreview,
    revealPosition,
    clearRevealPosition,
    updateTabContentByPath,
    markTabSavedByPath,
    setTabErrorByPath,
  } = useTabs();
  const { execute, state: queryState } = useQueryResults();
  const refreshProjectFiles = useRefreshProjectFiles();
  const { data: settings } = useGetSettings();
  const { isAiProviderSet, openChatWithMessage } = useAppContext();
  const { mutate: updateFileContent } = useSaveFileContent();

  const filePath = activeTab?.path;
  const fileContent = activeTab?.content;
  const isSqlFile = !!filePath?.endsWith('.sql');

  // --- SQL execution from code lenses -----------------------------------
  const handleExecuteQuery = React.useCallback(
    async ({
      sql,
      filePath: queryFilePath,
      modelName,
      compileModel,
    }: {
      sql: string;
      filePath: string;
      modelName?: string;
      compileModel?: boolean;
    }) => {
      if (!settings?.dbtPath && compileModel) {
        toast.info('Please configure dbt path in settings');
        return;
      }
      await execute({
        project,
        filePath: queryFilePath,
        rawSql: sql,
        modelName,
        compileModel,
        limit: queryState.limit,
      });
    },
    [execute, project, settings?.dbtPath, queryState.limit],
  );

  const handleExecuteCte = React.useCallback(
    async ({
      sql,
      filePath: queryFilePath,
      cteName,
      modelName,
      compileModel,
    }: {
      sql: string;
      filePath: string;
      cteName: string;
      modelName?: string;
      compileModel?: boolean;
    }) => {
      if (!settings?.dbtPath && compileModel) {
        toast.info('Please configure dbt path in settings');
        return;
      }
      await execute({
        project,
        filePath: queryFilePath,
        rawSql: sql,
        querySql: sql,
        modelName,
        label: `CTE ${cteName}`,
        compileModel,
        cteName,
        limit: queryState.limit,
      });
    },
    [execute, project, settings?.dbtPath, queryState.limit],
  );

  // --- AI actions on .sql models ----------------------------------------
  const [noAiSetModal, setNoAiSetModal] = React.useState(false);
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false);
  const [aiTransformationPrompt, setAiTransformationPrompt] =
    React.useState<string>();

  const generateBasicTransformationPrompt = async (modelPath: string) => {
    const fileName = nodePath.parse(modelPath).name;
    const tables = await projectsServices.extractSchemaFromModelYaml(project);
    // If Rosetta model.yaml is missing or empty, notify the user gracefully
    if (!tables || tables.length === 0) {
      const modelName = fileName.replace(/\.sql$/i, '');
      const { schema, table } = utils.extractSchemaAndTable(fileName);
      const expectedModel = schema && table ? `${schema}.${table}` : modelName;
      toast.info(
        `AI context incomplete: database schema missing. Run Rosetta → Raw layer to generate rosetta/${project.name}/model.yaml (should include "${expectedModel}"). Then try again.`,
      );
    }
    const { schema, table } = utils.extractSchemaAndTable(fileName);

    const tableStructure = tables.find(
      (tmpTable) => tmpTable.name === table && tmpTable.schema === schema,
    );

    if (!tableStructure) {
      setAiTransformationPrompt(
        utils.format(
          AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITHOUT_TABLE,
          fileName,
          String(fileContent),
          String(project.dbtConnection?.type),
        ),
      );
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

    setAiTransformationPrompt(
      utils.format(
        AI_PROMPTS.BASIC_TRANSFORM_PROMPT_WITH_TABLE,
        `${schema}.${table}`,
        promptTable,
        fileName,
        String(fileContent),
        String(project.dbtConnection?.type),
      ),
    );
  };

  const generateEnhancedTransformationPrompt = (
    content: string,
    connectionType: SupportedConnectionTypes,
  ) => {
    setAiTransformationPrompt(
      utils.format(AI_PROMPTS.ENHANCE_ENHANCED_MODEL, connectionType, content),
    );
  };

  const generateDashboards = async () => {
    if (!isAiProviderSet) {
      toast.error('AI API Key not provided');
      return;
    }
    if (!filePath || !fileContent) {
      toast.error('No file selected');
      return;
    }

    setIsLoadingQuery(true);
    try {
      openChatWithMessage(
        utils.format(
          AI_PROMPTS.GENERATE_DASHBOARDS,
          nodePath.parse(filePath).name,
          String(project.dbtConnection?.type),
          String(fileContent),
        ),
      );
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
    if (!filePath || !fileContent || !isSqlFile) {
      return [];
    }
    const items = [
      {
        name: 'Suggest Basic Transformations',
        onClick: () => {
          if (isAiProviderSet) {
            generateBasicTransformationPrompt(filePath);
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
      filePath.includes(project.incrementalDir)
    ) {
      items.push({
        name: 'Determine Incremental & Unique Key Columns',
        onClick: () => {
          if (isAiProviderSet) {
            generateEnhancedTransformationPrompt(
              fileContent,
              project.connection!.type,
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
  }, [filePath, fileContent]);

  return (
    <>
      <Editor
        projectId={project.id}
        projectPath={project.path}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabContentChange={updateTabContent}
        onTabSaved={markTabSaved}
        onTabError={setTabError}
        onGitStatusRefresh={refreshProjectFiles}
        onOpenFile={openFile}
        onTogglePreviewTab={togglePreview}
        onExecuteQuery={handleExecuteQuery}
        onExecuteCte={handleExecuteCte}
        revealPosition={revealPosition}
        onRevealHandled={clearRevealPosition}
        extraActions={
          <>
            {menuItems.length > 0 && (
              <SplitButton
                title="AI"
                isLoading={isLoadingQuery}
                leftIcon={<AutoAwesome />}
                menuItems={menuItems}
              />
            )}
            {filePath && isSqlFile && filePath.includes('models') && (
              <ModelSplitButton
                modelPath={filePath}
                project={project}
                fileContent={fileContent}
              />
            )}
          </>
        }
      />
      {noAiSetModal && (
        <NoAiSetModal
          isOpen={noAiSetModal}
          onClose={() => setNoAiSetModal(false)}
        />
      )}
      {aiTransformationPrompt && (
        <AiPromptModal
          isOpen={!!aiTransformationPrompt}
          onClose={() => setAiTransformationPrompt(undefined)}
          onApply={async (value) => {
            if (filePath) {
              updateTabContentByPath(filePath, value, { markModified: false });
              markTabSavedByPath(filePath);
              setTabErrorByPath(filePath, undefined);
            } else {
              toast.error('No file selected');
            }
            updateFileContent({ path: String(filePath), content: value });
            toast.success('Content saved!');
          }}
          prompt={aiTransformationPrompt}
          onPromptChange={(value) => setAiTransformationPrompt(value)}
          onSubmit={async () => {
            openChatWithMessage(aiTransformationPrompt);
            setAiTransformationPrompt(undefined);
          }}
        />
      )}
    </>
  );
};

const CodeFileView: React.FC<FileViewProps> = ({ project }) => (
  <EditorTabs project={project} />
);

export const codeFileView: FileViewDefinition = {
  id: 'code',
  matches: () => true,
  Component: CodeFileView,
};
