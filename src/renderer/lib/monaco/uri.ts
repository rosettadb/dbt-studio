import * as monaco from 'monaco-editor';

const SCHEME = 'dbt-file';
const DEFAULT_AUTHORITY = 'default';

/**
 * Build a Monaco model URI for a file in a project. The project id is
 * encoded in the URI authority so completion providers can read project
 * context off the model itself instead of relying on shared module state.
 */
export const buildModelUri = (
  projectId: string | undefined,
  filePath: string,
): monaco.Uri => {
  const authority = projectId || DEFAULT_AUTHORITY;
  const normalized = filePath.replace(/\\/g, '/');
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return monaco.Uri.from({ scheme: SCHEME, authority, path });
};

/**
 * Extract the project id encoded in a model URI, or undefined if the URI
 * is not one we own or has no project context.
 */
export const projectIdFromUri = (uri: monaco.Uri): string | undefined => {
  if (uri.scheme !== SCHEME) return undefined;
  if (!uri.authority || uri.authority === DEFAULT_AUTHORITY) return undefined;
  return uri.authority;
};
