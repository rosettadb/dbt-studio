import type { SpannerConnection } from '../types/backend';

export const DEFAULT_SPANNER_EMULATOR_HOST = 'localhost:9010';
export const SPANNER_MAX_ROWS = 10_000;
export const SPANNER_MAX_JSON_CHARS = 64_000;

export function validateSpannerIds(input: {
  project: string;
  instance: string;
  database: string;
}): string | undefined {
  const project = input.project.trim();
  const projectId = project.startsWith('domain:') ? project.slice(7) : project;
  if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)) {
    return 'Enter a valid Google Cloud project ID.';
  }
  if (!/^[a-z][a-z0-9-]{0,62}[a-z0-9]$/.test(input.instance.trim())) {
    return 'Enter a valid Spanner instance ID (2–64 characters).';
  }
  if (!/^[a-z][a-z0-9_-]{0,28}[a-z0-9]$/.test(input.database.trim())) {
    return 'Enter a valid Spanner database ID (2–30 characters).';
  }
  return undefined;
}

export function validateSpannerEmulatorHost(host: string): boolean {
  const match = /^([^\s:/]+):(\d{1,5})$/.exec(host.trim());
  return !!match && Number(match[2]) > 0 && Number(match[2]) <= 65535;
}

export function spannerDatabasePath(connection: SpannerConnection): string {
  return `projects/${connection.project}/instances/${connection.instance}/databases/${connection.database}`;
}

/** Error message for an unusable service-account key, or undefined if OK. */
export function validateServiceAccountKeyJson(
  text: string,
): string | undefined {
  let key: any;
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
  ) {
    return 'Provide a service account JSON with client_email and private_key.';
  }
  return undefined;
}
