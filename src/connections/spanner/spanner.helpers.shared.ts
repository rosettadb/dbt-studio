import type { SpannerConnection } from './spanner.shared';

export const DEFAULT_SPANNER_EMULATOR_HOST = 'localhost:9010';
export const SPANNER_MAX_ROWS = 10_000;
export const SPANNER_MAX_JSON_CHARS = 64_000;

/** The keytar key name for a connection's service-account key. */
export const spannerKeyName = (connectionName: string): string =>
  `db-spanner-${connectionName}`;

/** True when `keyfile` holds raw key JSON rather than a keytar key name. */
export const isRawSpannerKey = (keyfile: string | undefined): boolean =>
  !!keyfile && keyfile.trimStart().startsWith('{');

// A domain-scoped project looks like `example.com:my-project`.
const PROJECT_ID = /^(?:[a-z0-9.-]+:)?[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
const INSTANCE_ID = /^[a-z][a-z0-9-]{0,62}[a-z0-9]$/;
const DATABASE_ID = /^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/;

export function validateSpannerIds(
  conn: Pick<SpannerConnection, 'project' | 'instance' | 'database'>,
): string | undefined {
  if (!PROJECT_ID.test(conn.project?.trim() ?? ''))
    return 'Enter a valid Google Cloud project ID.';
  if (!INSTANCE_ID.test(conn.instance?.trim() ?? ''))
    return 'Enter a valid Spanner instance ID (2–64 characters).';
  if (!DATABASE_ID.test(conn.database?.trim() ?? ''))
    return 'Enter a valid Spanner database ID (2–30 characters).';
  return undefined;
}

export function validateSpannerEmulatorHost(host: string): boolean {
  const match = /^([^\s:/]+):(\d{1,5})$/.exec(host.trim());
  return !!match && Number(match[2]) > 0 && Number(match[2]) <= 65535;
}

/** Error message for an unusable service-account key, or undefined if it is fine. */
export function validateSpannerKeyJson(text: string): string | undefined {
  let key: Record<string, unknown> | null;
  try {
    key = JSON.parse(text);
  } catch {
    return 'Service account key must be valid JSON.';
  }
  if (
    !key ||
    key.type !== 'service_account' ||
    !key.client_email ||
    !key.private_key
  )
    return 'Provide a service account JSON with client_email and private_key.';
  return undefined;
}
