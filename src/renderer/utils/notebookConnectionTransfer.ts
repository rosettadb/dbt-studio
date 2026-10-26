/**
 * Helpers for carrying full connection details (including credentials)
 * inside notebook export/import JSON files.
 */
import { ConnectionInput, ConnectionModel } from '../../types/backend';
import useSecureStorage from '../hooks/useSecureStorage';
import { DEFAULT_SECRETS } from '../../connections/core/descriptor.shared';
import { getDescriptor } from '../../connections/registry.shared';

type SecureStorage = ReturnType<typeof useSecureStorage>;

const secretsOf = (connection: ConnectionInput) =>
  getDescriptor(connection.type)?.secrets ?? DEFAULT_SECRETS;

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
  const fields = secretsOf(connection).filter(
    (s) => s.exportable !== false && s.field in resolved,
  );
  const values = await Promise.all(
    fields.map((s) => secureStorage.getConnectionField(s.key, connection.name)),
  );
  fields.forEach((s, i) => {
    if (values[i]) resolved[s.field] = values[i];
  });

  return resolved as ConnectionInput;
}

/**
 * Persist the credentials embedded in an imported connection into secure
 * storage, matching the writes each connection form performs on save
 * (see e.g. connections/postgres/PostgresForm.tsx handleSubmit).
 */
export async function storeImportedConnectionCredentials(
  connection: ConnectionInput,
  secureStorage: SecureStorage,
): Promise<void> {
  const asAny = connection as any;
  await Promise.all(
    secretsOf(connection)
      .filter((s) => s.field in connection && asAny[s.field])
      .map((s) =>
        secureStorage.setConnectionField(
          s.key,
          asAny[s.field],
          connection.name,
        ),
      ),
  );
}

export async function deleteImportedConnectionCredentials(
  connection: ConnectionInput,
  secureStorage: SecureStorage,
): Promise<void> {
  const asAny = connection as any;
  await Promise.all(
    secretsOf(connection)
      .filter((s) => s.field in connection && asAny[s.field])
      .map((s) => secureStorage.deleteConnectionField(s.key, connection.name)),
  );
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
