/**
 * Helpers for carrying full connection details (including credentials)
 * inside notebook export/import JSON files.
 */
import { ConnectionInput, ConnectionModel } from '../../types/backend';
import useSecureStorage from '../hooks/useSecureStorage';

type SecureStorage = ReturnType<typeof useSecureStorage>;

/**
 * Overlay the real credentials from secure storage onto a connection object,
 * mirroring how the main process resolves credentials at query time
 * (ConnectorsService.executeSelectStatement). The connection object stored
 * in the app DB does not reliably hold the live secret (e.g. BigQuery
 * keyfiles are replaced with a placeholder on write), so secure storage is
 * the source of truth.
 */
export async function resolveConnectionCredentials(
  connection: ConnectionInput,
  secureStorage: SecureStorage,
): Promise<ConnectionInput> {
  const resolved: any = { ...connection };
  const { name } = connection;

  if ('username' in resolved) {
    const storedUsername = await secureStorage.getDatabaseUsername(name);
    if (storedUsername) resolved.username = storedUsername;
  }
  if ('password' in resolved) {
    const storedPassword = await secureStorage.getDatabasePassword(name);
    if (storedPassword) resolved.password = storedPassword;
  }
  if ('token' in resolved) {
    const storedToken = await secureStorage.getDatabaseToken(name);
    if (storedToken) resolved.token = storedToken;
  }
  if (resolved.type === 'bigquery') {
    const storedKey = await secureStorage.getBigQueryServiceAccountKey(name);
    if (storedKey) resolved.keyfile = storedKey;
  }

  return resolved as ConnectionInput;
}

/**
 * Persist the credentials embedded in an imported connection into secure
 * storage, matching the writes each connection form performs on save
 * (see e.g. components/connections/postgres.tsx handleSubmit).
 */
export async function storeImportedConnectionCredentials(
  connection: ConnectionInput,
  secureStorage: SecureStorage,
): Promise<void> {
  const { name } = connection;
  const asAny = connection as any;

  if ('username' in connection && asAny.username) {
    await secureStorage.setDatabaseUsername(asAny.username, name);
  }
  if ('password' in connection && asAny.password) {
    await secureStorage.setDatabasePassword(asAny.password, name);
  }
  if ('token' in connection && asAny.token) {
    await secureStorage.setDatabaseToken(asAny.token, name);
  }
  if (connection.type === 'bigquery' && asAny.keyfile) {
    await secureStorage.setBigQueryServiceAccountKey(asAny.keyfile, name);
  }
}

/**
 * Given a desired connection name, return a name that doesn't collide
 * (case-insensitively) with any existing connection, appending
 * "(Imported)" / "(Imported N)" as needed.
 */
export function getUniqueConnectionName(
  name: string,
  existingConnections: ConnectionModel[],
): string {
  const taken = new Set(
    existingConnections.map((c) => c.connection.name.trim().toLowerCase()),
  );

  if (!taken.has(name.trim().toLowerCase())) {
    return name;
  }

  let candidate = `${name} (Imported)`;
  let counter = 2;
  while (taken.has(candidate.trim().toLowerCase())) {
    candidate = `${name} (Imported ${counter})`;
    counter += 1;
  }
  return candidate;
}
