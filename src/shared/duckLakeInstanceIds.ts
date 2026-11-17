/**
 * The SQL Editor, Notebooks and Analytics address a DuckLake instance as the
 * connection id `ducklake-<instanceId>` (no saved connection behind it).
 * Analytics projects link to an instance the same way (plan 95). Shared by
 * main and renderer.
 */
export const DUCKLAKE_INSTANCE_ID_PREFIX = 'ducklake-';

export const duckLakeInstanceConnectionId = (instanceId: string): string =>
  `${DUCKLAKE_INSTANCE_ID_PREFIX}${instanceId}`;

/** The instance id, or undefined when this isn't a DuckLake instance id. */
export const duckLakeInstanceIdOf = (
  connectionId?: string,
): string | undefined =>
  connectionId?.startsWith(DUCKLAKE_INSTANCE_ID_PREFIX)
    ? connectionId.slice(DUCKLAKE_INSTANCE_ID_PREFIX.length)
    : undefined;
