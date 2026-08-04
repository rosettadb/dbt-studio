import { FabricSparkConnection } from '../../types/backend';

export const FABRIC_API_ENDPOINT = 'https://api.fabric.microsoft.com/v1';

export const buildFabricProfileOutput = (
  connection: FabricSparkConnection,
  clientSecret?: string,
): Record<string, unknown> => {
  return {
    type: 'fabricspark',
    method: 'livy',
    endpoint: FABRIC_API_ENDPOINT,
    workspaceid: connection.workspaceId,
    lakehouseid: connection.lakehouseId,
    lakehouse: connection.lakehouse,
    schema: connection.schema,
    authentication: connection.authentication,
    ...(connection.authentication === 'SPN'
      ? {
          client_id: connection.clientId,
          tenant_id: connection.tenantId,
          ...(clientSecret ? { client_secret: clientSecret } : {}),
        }
      : {}),
    threads: connection.threads,
    ...(connection.environmentId
      ? { environmentId: connection.environmentId }
      : {}),
    reuse_session: connection.reuseSession,
    session_id_file: 'target/fabricspark-session-id',
    ...(connection.highConcurrency !== undefined
      ? { high_concurrency: connection.highConcurrency }
      : {}),
    ...(connection.workspaceName
      ? { workspace_name: connection.workspaceName }
      : {}),
  };
};
