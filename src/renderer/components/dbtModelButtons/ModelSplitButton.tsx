import React, { useState } from 'react';
import { DirectionsRun } from '@mui/icons-material';

import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { Project } from '../../../types/backend';
import { icons } from '../../../../assets/icons';
import { Icon } from '../icon';
import { extractModelNameFromPath } from '../../helpers/utils';
import { CompileModal } from '../modals/CompileModal';
import { MiniSqlEditorModal } from '../modals/MiniSqlEditorModal';
import { PushToCloudModal } from '../modals';
import useDbt from '../../hooks/useDbt';
import {
  queryData,
  getConnectionById,
} from '../../services/connectors.service';
import type { PreviewResult } from '../../../types/frontend';
import type { DbtCommandType } from '../../../types/backend';
import type { ProjectQueryPreviewPayload } from '../projectQueryResults';

interface ModelSplitButtonProps {
  modelPath: string;
  project: Project;
  isDbtConfigured: boolean;
  fileContent?: string;
  isRunningDbt: boolean;
  isRunningRosettaDbt: boolean;
  environment?: 'local' | 'cloud';
  onBeforeExecute?: () => void;
  onQueryPreviewStart?: (payload: Partial<ProjectQueryPreviewPayload>) => void;
  onQueryPreviewSuccess?: (payload: ProjectQueryPreviewPayload) => void;
  onQueryPreviewError?: (payload: ProjectQueryPreviewPayload) => void;
}

export const ModelSplitButton: React.FC<ModelSplitButtonProps> = ({
  modelPath,
  project,
  isDbtConfigured,
  fileContent,
  isRunningDbt,
  isRunningRosettaDbt,
  environment = 'local',
  onBeforeExecute,
  onQueryPreviewStart,
  onQueryPreviewSuccess,
  onQueryPreviewError,
}) => {
  const [isCompiling, setIsCompiling] = useState(false);
  const [showCompileModal, setShowCompileModal] = useState(false);
  const [compiledSql, setCompiledSql] = useState<string>('');
  const [originalSql, setOriginalSql] = useState<string>('');

  // Preview state
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewResult, setPreviewResult] = useState<PreviewResult | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | undefined>();

  // Cloud execution state
  const [runInCloudModal, setRunInCloudModal] = useState<DbtCommandType>();
  const [cloudDbtArguments, setCloudDbtArguments] = useState<string>('');

  const {
    compile: dbtCompileModel,
    run: dbtRunModel,
    test: dbtTestModel,
    isRunning: isRunningDbtModel,
    list: dbtList,
    build: dbtBuildModel,
  } = useDbt(undefined, (command) => {
    setRunInCloudModal(command);
  });

  // Helper function to handle cloud vs local execution
  const executeCommand = async (
    command: DbtCommandType,
    localHandler: () => Promise<void>,
    dbtArgs?: string,
  ) => {
    onBeforeExecute?.();
    if (environment === 'cloud') {
      setCloudDbtArguments(dbtArgs || '');
      setRunInCloudModal(command);
    } else {
      await localHandler();
    }
  };

  const handleCompileModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    if (!fileContent) {
      toast.error('No SQL content to compile');
      return;
    }

    setIsCompiling(true);
    setOriginalSql(fileContent);

    try {
      // Extract model name from path for compilation
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Use the actual dbt compile command to get real compiled SQL
      const realCompiledSql = await dbtCompileModel(project, modelName);

      if (!realCompiledSql || realCompiledSql.trim() === '') {
        toast.error(
          'No compiled SQL returned. The model might not exist or be disabled.',
        );
        return;
      }

      setCompiledSql(realCompiledSql);
      setShowCompileModal(true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // If it's a "no models found" error, try to list available models for debugging
      if (errorMessage.includes('No models found matching selection')) {
        try {
          const availableModels = await dbtList(project);
          toast.error(
            `${errorMessage}\n\nAvailable models:\n${availableModels}`,
          );
        } catch (listError) {
          toast.error(
            `${errorMessage}\n\nCould not list available models: ${listError}`,
          );
        }
      } else {
        toast.error(`Compile failed: ${errorMessage}`);
      }
    } finally {
      setIsCompiling(false);
    }
  };

  const handlePreviewModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    if (!fileContent) {
      toast.error('No SQL content to preview');
      return;
    }

    setIsPreviewing(true);
    setPreviewError(undefined);
    setPreviewResult(null);
    const startedAt = Date.now();
    onQueryPreviewStart?.({
      projectId: project.id,
      projectName: project.name,
      filePath: modelPath,
      rawSql: fileContent,
    });

    try {
      // Extract model name from path for compilation
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        const errorMessage = 'Could not extract model name from path';
        toast.error(errorMessage);
        onQueryPreviewError?.({
          projectId: project.id,
          projectName: project.name,
          filePath: modelPath,
          rawSql: fileContent,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        return;
      }

      // First compile the model to get the SQL
      const modelCompiledSql = await dbtCompileModel(project, modelName);

      if (!modelCompiledSql || modelCompiledSql.trim() === '') {
        const errorMessage =
          'No compiled SQL returned. The model might not exist or be disabled.';
        toast.error(errorMessage);
        onQueryPreviewError?.({
          projectId: project.id,
          projectName: project.name,
          filePath: modelPath,
          modelName,
          rawSql: fileContent,
          compiledSql: modelCompiledSql,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        return;
      }

      // Check if project has a connection configured
      if (!project.connectionId) {
        const errorMessage =
          'No database connection configured for this project';
        toast.error(errorMessage);
        onQueryPreviewError?.({
          projectId: project.id,
          projectName: project.name,
          filePath: modelPath,
          modelName,
          rawSql: fileContent,
          compiledSql: modelCompiledSql,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        return;
      }

      // Get the connection details
      const connection = await getConnectionById(project.connectionId);
      if (!connection) {
        const errorMessage = 'Database connection not found';
        toast.error(errorMessage);
        onQueryPreviewError?.({
          projectId: project.id,
          projectName: project.name,
          filePath: modelPath,
          modelName,
          rawSql: fileContent,
          compiledSql: modelCompiledSql,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        return;
      }

      // Execute the compiled SQL query
      const queryResult = await queryData({
        connection: connection.connection,
        query: modelCompiledSql,
        projectName: project.name,
      });

      if (!queryResult.success) {
        const errorMessage = queryResult.error || 'Query execution failed';
        toast.error(`Preview failed: ${errorMessage}`);
        setPreviewError(errorMessage);
        setIsPreviewing(false);
        onQueryPreviewError?.({
          projectId: project.id,
          projectName: project.name,
          filePath: modelPath,
          modelName,
          rawSql: fileContent,
          compiledSql: modelCompiledSql,
          result: queryResult,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        return;
      }

      // Convert the query result to PreviewResult format
      const modelPreviewResult: PreviewResult = {
        success: true,
        data: queryResult.data || [],
        columns:
          queryResult.fields?.map((field) => ({
            name: field.name,
            type: field.type.toString(),
          })) || [],
        totalRows: queryResult.rowCount || queryResult.data?.length || 0,
        objectPath: modelName,
        previewType: 'sample',
      };

      setPreviewResult(modelPreviewResult);
      setShowPreviewModal(true);
      onQueryPreviewSuccess?.({
        projectId: project.id,
        projectName: project.name,
        filePath: modelPath,
        modelName,
        rawSql: fileContent,
        compiledSql: modelCompiledSql,
        result: {
          ...queryResult,
          duration: Date.now() - startedAt,
        },
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setPreviewError(errorMessage);
      toast.error(`Preview failed: ${errorMessage}`);
      onQueryPreviewError?.({
        projectId: project.id,
        projectName: project.name,
        filePath: modelPath,
        rawSql: fileContent,
        durationMs: Date.now() - startedAt,
        errorMessage,
      });
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleRunModel = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'run',
      async () => {
        try {
          // Run the single model using dbt run --select
          await dbtRunModel(project, modelName);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Model execution failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}`,
    );
  };

  const handleTestModel = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'test',
      async () => {
        try {
          // Run tests on the single model using dbt test --select
          await dbtTestModel(project, modelName);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Model tests failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}`,
    );
  };

  const handleRunModelDownstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'run',
      async () => {
        try {
          // Run the model and all its downstream dependencies using dbt run --select model_name+
          // The + suffix tells dbt to include all downstream models
          await dbtRunModel(project, `${modelName}+`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Downstream run failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}+`,
    );
  };

  const handleRunModelUpstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'run',
      async () => {
        try {
          // Run the model and all its upstream dependencies using dbt run --select +model_name
          // The + prefix tells dbt to include all upstream models (parents)
          await dbtRunModel(project, `+${modelName}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Upstream run failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}`,
    );
  };

  const handleRunModelBothDirections = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'run',
      async () => {
        try {
          // Run the model and all its upstream and downstream dependencies using dbt run --select +model_name+
          // The + prefix and suffix tells dbt to include both upstream and downstream models
          await dbtRunModel(project, `+${modelName}+`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Full dependency run failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}+`,
    );
  };

  const handleTestModelDownstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'test',
      async () => {
        try {
          // Run tests on the model and all its downstream dependencies using dbt test --select model_name+
          // The + suffix tells dbt to include all downstream models
          await dbtTestModel(project, `${modelName}+`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Downstream tests failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}+`,
    );
  };

  const handleTestModelUpstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'test',
      async () => {
        try {
          // Run tests on the model and all its upstream dependencies using dbt test --select +model_name
          // The + prefix tells dbt to include all upstream models (parents)
          await dbtTestModel(project, `+${modelName}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Upstream tests failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}`,
    );
  };

  const handleTestModelBothDirections = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'test',
      async () => {
        try {
          // Run tests on the model and all its upstream and downstream dependencies using dbt test --select +model_name+
          // The + prefix and suffix tells dbt to include both upstream and downstream models
          await dbtTestModel(project, `+${modelName}+`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Full dependency tests failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}+`,
    );
  };

  const handleBuildModel = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'build',
      async () => {
        try {
          // Build the single model using dbt build --select
          // This will run the model + tests + seeds + snapshots
          await dbtBuildModel(project, modelName);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Model build failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}`,
    );
  };

  const handleBuildModelDownstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'build',
      async () => {
        try {
          // Build the model and all its downstream dependencies using dbt build --select model_name+
          // The + suffix tells dbt to include all downstream models
          await dbtBuildModel(project, `${modelName}+`);
          toast.success(
            `Model '${modelName}' and downstream models built successfully`,
          );
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Downstream build failed: ${errorMessage}`);
        }
      },
      `--select ${modelName}+`,
    );
  };

  const handleBuildModelUpstream = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'build',
      async () => {
        try {
          // Build the model and all its upstream dependencies using dbt build --select +model_name
          // The + prefix tells dbt to include all upstream models (parents)
          await dbtBuildModel(project, `+${modelName}`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Upstream build failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}`,
    );
  };

  const handleBuildModelBothDirections = async () => {
    if (!isDbtConfigured && environment === 'local') {
      toast.info('Please configure dbt path in settings');
      return;
    }

    // Extract model name for both local and cloud execution
    const modelName = extractModelNameFromPath(modelPath);
    if (!modelName) {
      toast.error('Could not extract model name from path');
      return;
    }

    await executeCommand(
      'build',
      async () => {
        try {
          // Build the model and all its upstream and downstream dependencies using dbt build --select +model_name+
          // The + prefix and suffix tells dbt to include both upstream and downstream models
          await dbtBuildModel(project, `+${modelName}+`);
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : 'Unknown error';
          toast.error(`Full dependency build failed: ${errorMessage}`);
        }
      },
      `--select +${modelName}+`,
    );
  };

  // Define all menu items with environment restrictions
  const allMenuItems = [
    // Production DBT Commands (Available in both environments)
    {
      name: 'Run',
      onClick: handleRunModel,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the dbt model',
      localOnly: false,
    },
    {
      name: 'Run model+ (Downstream)',
      onClick: handleRunModelDownstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the model and all its downstream dependencies',
      localOnly: false,
    },
    {
      name: 'Run +model (Upstream)',
      onClick: handleRunModelUpstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the model and all its upstream dependencies',
      localOnly: false,
    },
    {
      name: 'Run +model+ (Up/downstream)',
      onClick: handleRunModelBothDirections,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle:
        'Run the model and all its upstream and downstream dependencies',
      localOnly: false,
    },
    {
      name: 'Build Model',
      onClick: handleBuildModel,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Build model with tests and validation',
      localOnly: false,
    },
    {
      name: 'Build model+ (Downstream)',
      onClick: handleBuildModelDownstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Build the model and all its downstream dependencies',
      localOnly: false,
    },
    {
      name: 'Build +model (Upstream)',
      onClick: handleBuildModelUpstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Build the model and all its upstream dependencies',
      localOnly: false,
    },
    {
      name: 'Build +model+ (Up/downstream)',
      onClick: handleBuildModelBothDirections,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle:
        'Build the model and all its upstream and downstream dependencies',
      localOnly: false,
    },
    {
      name: 'Test',
      onClick: handleTestModel,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Run the dbt test',
      localOnly: false,
    },
    {
      name: 'Test model+ (Downstream)',
      onClick: handleTestModelDownstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Test the model and all its downstream dependencies',
      localOnly: false,
    },
    {
      name: 'Test +model (Upstream)',
      onClick: handleTestModelUpstream,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Test the model and all its upstream dependencies',
      localOnly: false,
    },
    {
      name: 'Test +model+ (Up/downstream)',
      onClick: handleTestModelBothDirections,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle:
        'Test the model and all its upstream and downstream dependencies',
      localOnly: false,
    },
    // Local Development Commands (Local Only)
    {
      name: 'Compile',
      onClick: handleCompileModel,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Compile the dbt model',
      localOnly: true, // Compile is for local development/debugging
    },
    {
      name: 'Preview',
      onClick: handlePreviewModel,
      leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
      subTitle: 'Preview the dbt model data',
      localOnly: true, // Preview is for local development/debugging
    },
  ];

  // Filter menu items based on environment
  // In cloud mode: hide local development tools (compile, preview)
  // In local mode: show all items
  const filteredMenuItems = allMenuItems.filter((item) => {
    if (environment === 'cloud') {
      return !item.localOnly;
    }
    return true; // Show all items in local environment
  });

  return (
    <>
      <SplitButton
        title="Model"
        tooltipTitle={
          isDbtConfigured ? '' : 'Please configure dbt path in settings'
        }
        disabled={
          isRunningDbt ||
          isRunningRosettaDbt ||
          isCompiling ||
          isRunningDbtModel ||
          isPreviewing
        }
        isLoading={
          isRunningDbt ||
          isRunningRosettaDbt ||
          isCompiling ||
          isRunningDbtModel ||
          isPreviewing
        }
        leftIcon={<DirectionsRun />}
        menuItems={filteredMenuItems.map((item) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { localOnly, ...menuItem } = item;
          return menuItem;
        })}
      />

      <CompileModal
        open={showCompileModal}
        onClose={() => setShowCompileModal(false)}
        originalSql={originalSql}
        compiledSql={compiledSql}
        modelName={extractModelNameFromPath(modelPath)}
      />

      <MiniSqlEditorModal
        open={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        modelName={extractModelNameFromPath(modelPath)}
        previewResult={previewResult}
        loading={isPreviewing}
        error={previewError}
      />

      {runInCloudModal && (
        <PushToCloudModal
          isOpen={!!runInCloudModal}
          onClose={() => {
            setRunInCloudModal(undefined);
            setCloudDbtArguments('');
          }}
          project={project}
          command={runInCloudModal}
          initialDbtArguments={cloudDbtArguments}
        />
      )}
    </>
  );
};
