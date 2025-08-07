import React, { useState } from 'react';
import { PlayCircleOutline } from '@mui/icons-material';
import { toast } from 'react-toastify';
import { SplitButton } from '../splitButton';
import { Project } from '../../../types/backend';
import { icons } from '../../../../assets/icons';
import { Icon } from '../icon';
import { extractModelNameFromPath } from '../../helpers/utils';
import { CompileModal } from '../modals/CompileModal';
import { MiniSqlEditorModal } from '../modals/MiniSqlEditorModal';
import useDbt from '../../hooks/useDbt';
import {
  queryData,
  getConnectionById,
} from '../../services/connectors.service';
import type { PreviewResult } from '../../../types/frontend';

interface ModelSplitButtonProps {
  modelPath: string;
  project: Project;
  isDbtConfigured: boolean;
  fileContent?: string;
  isRunningDbt: boolean;
  isRunningRosettaDbt: boolean;
}

export const ModelSplitButton: React.FC<ModelSplitButtonProps> = ({
  modelPath,
  project,
  isDbtConfigured,
  fileContent,
  isRunningDbt,
  isRunningRosettaDbt,
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

  const {
    compile: dbtCompileModel,
    run: dbtRunModel,
    test: dbtTestModel,
    build: dbtBuildModel,
    isRunning: isRunningDbtModel,
    list: dbtList,
  } = useDbt();

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
      toast.success('Model compiled successfully');
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

    try {
      // Extract model name from path for compilation
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // First compile the model to get the SQL
      const modelCompiledSql = await dbtCompileModel(project, modelName);

      if (!modelCompiledSql || modelCompiledSql.trim() === '') {
        toast.error(
          'No compiled SQL returned. The model might not exist or be disabled.',
        );
        return;
      }

      // Check if project has a connection configured
      if (!project.connectionId) {
        toast.error('No database connection configured for this project');
        return;
      }

      // Get the connection details
      const connection = await getConnectionById(project.connectionId);
      if (!connection) {
        toast.error('Database connection not found');
        return;
      }

      // Execute the compiled SQL query
      const queryResult = await queryData({
        connection: connection.connection,
        query: modelCompiledSql,
        projectName: project.name,
      });

      if (!queryResult.success) {
        throw new Error(queryResult.error || 'Query execution failed');
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
      toast.success('Model preview loaded successfully');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      setPreviewError(errorMessage);
      toast.error(`Preview failed: ${errorMessage}`);
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleRunModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for single model execution
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Run the single model using dbt run --select
      await dbtRunModel(project, modelName);
      toast.success(`Model '${modelName}' executed successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Model execution failed: ${errorMessage}`);
    }
  };

  const handleTestModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for single model testing
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Run tests on the single model using dbt test --select
      await dbtTestModel(project, modelName);
      toast.success(`Model '${modelName}' tests completed successfully`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Model tests failed: ${errorMessage}`);
    }
  };

  const handleBuildModel = async () => {
    if (!isDbtConfigured) {
      toast.info('Please configure dbt path in settings');
      return;
    }

    try {
      // Extract model name from path for single model building
      const modelName = extractModelNameFromPath(modelPath);
      if (!modelName) {
        toast.error('Could not extract model name from path');
        return;
      }

      // Build the single model using dbt build --select
      // This will run the model + tests + seeds + snapshots
      await dbtBuildModel(project, modelName);
      toast.success(`Model '${modelName}' built successfully with tests`);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Model build failed: ${errorMessage}`);
    }
  };

  return (
    <>
      <SplitButton
        title="Actions"
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
        leftIcon={<PlayCircleOutline />}
        menuItems={[
          {
            name: 'Run Model',
            onClick: handleRunModel,
            leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
            subTitle: 'Run the dbt model',
          },
          {
            name: 'Test Model',
            onClick: handleTestModel,
            leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
            subTitle: 'Run the dbt test',
          },
          {
            name: 'Compile Model',
            onClick: handleCompileModel,
            leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
            subTitle: 'Compile the dbt model',
          },
          {
            name: 'Preview Model',
            onClick: handlePreviewModel,
            leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
            subTitle: 'Preview the dbt model data',
          },
          {
            name: 'Build Model',
            onClick: handleBuildModel,
            leftIcon: <Icon src={icons.dbtTm} width={16} height={16} />,
            subTitle: 'Build model with tests and validation',
          },
        ]}
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
    </>
  );
};
