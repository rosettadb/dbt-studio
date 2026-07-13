import { CliProcessEnvironment, ConnectionInput } from '../../types/backend';

export const getDbtProcessEnvironment = (
  dbtVersion: string | undefined,
  connectionType: ConnectionInput['type'],
): CliProcessEnvironment | undefined => {
  if (dbtVersion?.startsWith('2.') && connectionType === 'postgres') {
    return { DBT_ALLOW_EXPERIMENTAL_ADAPTERS: 'true' };
  }
  return undefined;
};
