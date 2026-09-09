/**
 * Raw BigQuery service-account JSON must never be persisted to database.json
 * — only the secure-storage key name it was materialized under. This was
 * previously duplicated ad hoc in four separate call sites; centralized here
 * so there's exactly one place to fix if the key-naming scheme ever changes.
 */
export function sanitizeBigQueryKeyfile<
  T extends {
    connection?: { type?: string; keyfile?: string; name?: string };
  },
>(item: T): T {
  const { connection } = item;
  if (
    connection &&
    connection.type === 'bigquery' &&
    connection.keyfile &&
    connection.keyfile.startsWith('{')
  ) {
    connection.keyfile = `db-bigquery-${connection.name}`;
  }
  return item;
}
