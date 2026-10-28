import React from 'react';
import { toast } from 'react-toastify';
import {
  envFieldValueFor,
  getConnectionUi,
} from '../../connections/registry.renderer';
import { useCli, useSecureStorage } from './index';
import {
  useGetConnections,
  useGetSettings,
  useSetConnectionEnvVariable,
} from '../controllers';
import { Command, CommandType, Project } from '../../types/backend';
import { projectsServices } from '../services';
import { getOpenAIKey } from '../services/settings.services';
import { compileCommand } from '../helpers/utils';

const useRosettaDBT = (successCallback: () => Promise<void>) => {
  const { data: settings } = useGetSettings();
  const { runCommand } = useCli();
  const {
    getDatabaseUsername,
    getDatabasePassword,
    getDatabaseToken,
    getBigQueryServiceAccountKey,
    getConnectionField,
  } = useSecureStorage();
  const setEnvVariables = useSetConnectionEnvVariable();
  const [isRunning, setIsRunning] = React.useState(false);
  const { data: connections = [] } = useGetConnections(true);

  return {
    fn: async (project: Project, command: Command) => {
      setIsRunning(true);
      try {
        const connection = connections.find(
          (c) => c.id === project.connectionId,
        );
        if (!connection) {
          toast.error(
            'No database connection configured for this project. Please add a connection first.',
          );
          return;
        }
        // Set environment variables for the project
        const connectionName = connection.connection.name;
        const conn = connection.connection;
        const [username, password, token, bigQueryKey] = await Promise.all([
          getDatabaseUsername(connectionName),
          getDatabasePassword(connectionName),
          getDatabaseToken(connectionName),
          getBigQueryServiceAccountKey(connectionName),
        ]);

        const envPromises = [];
        if (username) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-user-${connectionName}`,
              value: username || '',
            }),
          );
        }
        if (password) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-password-${connectionName}`,
              value: password || '',
            }),
          );
        }
        if (token) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-token-${connectionName}`,
              value: token || '',
            }),
          );
        }
        if (bigQueryKey) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: `db-bigquery-${connectionName}`,
              value: bigQueryKey,
            }),
          );
        }

        const fields = getConnectionUi(conn.type)?.envFields ?? [];
        const fieldPromises = fields.map(async (field) => {
          const stored = await getConnectionField(field, connectionName);
          const value = stored || envFieldValueFor(conn as any, field);
          if (value) {
            return setEnvVariables.mutateAsync({
              key: `db-${field}-${connectionName}`,
              value,
            });
          }
          return undefined;
        });
        envPromises.push(...fieldPromises);

        const openaiKey = await getOpenAIKey();
        if (openaiKey) {
          envPromises.push(
            setEnvVariables.mutateAsync({
              key: 'openai-api-key',
              value: openaiKey,
            }),
          );
        }

        await Promise.all(envPromises);

        // 2-minute safety net — enough for large schema extracts;
        // the try/catch recovers cleanly if this fires
        const ROSETTA_TIMEOUT_MS = 2 * 60 * 1000;

        if (!project.isExtracted) {
          try {
            const compiledCommand = await compileCommand(project, settings, {
              commandType: CommandType.Rosetta,
              command: 'extract',
              arguments: new Map<string, string | number>().set(
                '-s',
                `${project.rosettaConnection?.name}`,
              ),
            } as Command);
            const result = await runCommand(
              compiledCommand,
              undefined,
              ROSETTA_TIMEOUT_MS,
            );
            if (result.exitCode !== 0 && result.exitCode !== null) {
              throw new Error(
                `Command failed with exit code ${result.exitCode}`,
              );
            }
            await projectsServices.updateProject({
              ...project,
              isExtracted: true,
            });
            toast.info('Schema extracted, now generating dbt...');
          } catch (err) {
            toast.error('Schema extraction failed');
            return;
          }
        }

        try {
          const compiledCommand = await compileCommand(
            project,
            settings,
            command,
          );
          const result = await runCommand(
            compiledCommand,
            undefined,
            ROSETTA_TIMEOUT_MS,
          );
          if (result.exitCode !== 0 && result.exitCode !== null) {
            throw new Error(`Command failed with exit code ${result.exitCode}`);
          }
          await successCallback();
          toast.success('Rosetta dbt completed successfully');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error(err);
          toast.error('Rosetta dbt command failed');
        }
      } finally {
        setIsRunning(false);
      }
    },
    isRunning,
  };
};

export default useRosettaDBT;
