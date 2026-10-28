/* eslint-disable global-require, @typescript-eslint/no-var-requires */

export type AgentName = 'sql' | 'analytics' | 'notebooks';

export type AgentHintContext = {
  agent: AgentName;
  /** The type string the agent received (may be an alias such as 'postgresql'). */
  requestedType: string;
  duckdbVersion: string;
  ducklakeVersion: string;
};

/** DuckLake is a DuckDB extension (not a JS package), version is fixed. */
export const DUCKLAKE_EXTENSION_VERSION = '1.0';

/** The lookup each agent does today (sqlAgent.ts lines 38-50). */
export function resolveDuckDbVersion(): string {
  let duckdbVersion = '1.5.2+';
  try {
    // Dynamically resolve duckdb version the exact same way the footer does
    const ddbPkg = require('@duckdb/node-api/package.json');
    if (ddbPkg && ddbPkg.version) {
      duckdbVersion = ddbPkg.version;
    }
  } catch (e) {
    // fallback
  }
  return duckdbVersion;
}

/** Today's `default:` text in all three agents. */
export const defaultAgentHint = (type: string): string =>
  `\n\n## Dialect Specifics\nYou are connected to a ${type} database. Ensure all queries use the correct dialect for this database.`;
