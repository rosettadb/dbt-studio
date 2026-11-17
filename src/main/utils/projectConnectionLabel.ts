import ConnectorsService from '../services/connectors.service';
import DuckLakeService from '../services/duckLake.service';
import { duckLakeInstanceIdOf } from '../../shared/duckLakeInstanceIds';

/**
 * Name and type of a project's connection, for the files Studio writes into a
 * new project (README, starter notebook). It's a saved connection, or for an
 * Analytics project possibly a DuckLake instance linked directly
 * (`ducklake-<id>`, plan 95). No secrets.
 */
export async function projectConnectionLabel(
  connectionId?: string,
): Promise<{ name: string; type: string } | undefined> {
  if (!connectionId) return undefined;
  const instanceId = duckLakeInstanceIdOf(connectionId);
  if (instanceId) {
    const instance = await DuckLakeService.getInstance(instanceId).catch(
      () => undefined,
    );
    return instance?.name
      ? { name: instance.name, type: 'ducklake' }
      : undefined;
  }
  const saved = await ConnectorsService.getConnectionById(connectionId);
  return saved
    ? { name: saved.connection.name, type: saved.connection.type }
    : undefined;
}
