import React from 'react';
import { toast } from 'react-toastify';
import type { Project } from '../../types/backend';
import { extractModelNameFromPath } from '../helpers/utils';
import { getConnectionById, queryData } from '../services/connectors.service';
import type { ProjectQueryPreviewPayload } from '../components/projectQueryResults';
import useDbt from './useDbt';
import { buildCteQueryFromSqlText } from '../utils/sql/cteDetection';

type LifecycleHandler = (payload: ProjectQueryPreviewPayload) => void;
type StartHandler = (payload: Partial<ProjectQueryPreviewPayload>) => void;

type ExecuteProjectSqlParams = {
  project: Project;
  filePath?: string;
  rawSql: string;
  querySql?: string;
  modelName?: string;
  label?: string;
  compileModel?: boolean;
  cteName?: string;
};

type UseProjectSqlExecutionParams = {
  onStart?: StartHandler;
  onSuccess?: LifecycleHandler;
  onError?: LifecycleHandler;
};

export const useProjectSqlExecution = ({
  onStart,
  onSuccess,
  onError,
}: UseProjectSqlExecutionParams = {}) => {
  const { compile: dbtCompileModel } = useDbt();

  const executeProjectSql = React.useCallback(
    async ({
      project,
      filePath,
      rawSql,
      querySql,
      modelName: explicitModelName,
      label,
      compileModel = false,
      cteName,
    }: ExecuteProjectSqlParams) => {
      const startedAt = Date.now();
      const modelName =
        explicitModelName ||
        (filePath ? extractModelNameFromPath(filePath) : undefined) ||
        label;

      onStart?.({
        projectId: project.id,
        projectName: project.name,
        filePath,
        modelName,
        rawSql,
      });

      try {
        let executableSql = querySql ?? rawSql;
        let compiledSql: string | undefined = querySql;

        if (compileModel) {
          if (!modelName) {
            throw new Error('Could not extract model name from path');
          }

          const modelCompiledSql = await dbtCompileModel(project, modelName);
          if (!modelCompiledSql || modelCompiledSql.trim() === '') {
            throw new Error(
              'No compiled SQL returned. The model might not exist or be disabled.',
            );
          }
          executableSql = modelCompiledSql;
          compiledSql = modelCompiledSql;

          if (cteName) {
            const compiledCteQuery = buildCteQueryFromSqlText(
              modelCompiledSql,
              cteName,
            );
            if (!compiledCteQuery) {
              throw new Error(
                `Could not find CTE "${cteName}" in compiled SQL`,
              );
            }
            executableSql = compiledCteQuery;
            compiledSql = compiledCteQuery;
          }
        }

        if (!project.connectionId) {
          throw new Error('No database connection configured for this project');
        }

        const connection = await getConnectionById(project.connectionId);
        if (!connection) {
          throw new Error('Database connection not found');
        }

        const result = await queryData({
          connection: connection.connection,
          query: executableSql,
          projectName: project.name,
        });
        const durationMs = Date.now() - startedAt;

        if (!result.success) {
          const errorMessage = result.error || 'Query execution failed';
          onError?.({
            projectId: project.id,
            projectName: project.name,
            filePath,
            modelName,
            rawSql,
            compiledSql,
            result,
            durationMs,
            errorMessage,
          });
          toast.error(`Query failed: ${errorMessage}`);
          return result;
        }

        onSuccess?.({
          projectId: project.id,
          projectName: project.name,
          filePath,
          modelName,
          rawSql,
          compiledSql,
          result: {
            ...result,
            duration: durationMs,
          },
          durationMs,
        });

        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        onError?.({
          projectId: project.id,
          projectName: project.name,
          filePath,
          modelName,
          rawSql,
          compiledSql: querySql,
          durationMs: Date.now() - startedAt,
          errorMessage,
        });
        toast.error(`Query failed: ${errorMessage}`);
        return undefined;
      }
    },
    [dbtCompileModel, onError, onStart, onSuccess],
  );

  return { executeProjectSql };
};

export default useProjectSqlExecution;
