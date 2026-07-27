/**
 * YAML Partial Update Utility
 *
 * This module provides functions to partially update YAML configuration files
 * (profiles.yml and main.conf) without regenerating the entire file.
 * This preserves custom developer changes like threads, extra targets, JDBC params, etc.
 */

import fs from 'fs';
import yaml from 'js-yaml';
import path from 'path';
import { ConnectionInput } from '../../types/backend';

/**
 * Extracts the database name from a file path (filename without extension)
 */
function extractDbNameFromPath(filePath: string): string {
  return path.parse(filePath).name;
}

/**
 * Error thrown when partial update fails
 */
export class PartialUpdateError extends Error {
  constructor(
    message: string,
    public readonly filePath: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'PartialUpdateError';
  }
}

/**
 * Generates the connection-specific output configuration for profiles.yml
 * This is the subset of fields that should be updated
 */
function generateProfileOutputFields(
  connection: ConnectionInput,
): Record<string, any> {
  const envVar = (field: string) =>
    `{{ env_var("db-${field}-${connection.name}") }}`;
  const envVarInt = (field: string) =>
    `{{ env_var("db-${field}-${connection.name}") | int }}`;
  const baseFields: Record<string, any> = {
    type: connection.type,
  };

  switch (connection.type) {
    case 'postgres':
      return {
        ...baseFields,
        host: envVar('host'),
        port: envVarInt('port'),
        user: envVar('user'),
        password: envVar('password'),
        dbname: envVar('dbname'),
        schema: envVar('schema'),
      };

    case 'snowflake':
      return {
        ...baseFields,
        account: envVar('account'),
        user: envVar('user'),
        password: envVar('password'),
        role: envVar('role'),
        database: envVar('dbname'),
        warehouse: envVar('warehouse'),
        schema: envVar('schema'),
      };

    case 'bigquery':
      return {
        ...baseFields,
        method: connection.method,
        project: envVar('project'),
        dataset: envVar('dataset'),
        keyfile: envVar('bigquery'),
        location: connection.location,
        priority: connection.priority,
      };

    case 'redshift':
      return {
        ...baseFields,
        host: envVar('host'),
        port: envVarInt('port'),
        user: envVar('user'),
        password: envVar('password'),
        dbname: envVar('dbname'),
        schema: envVar('schema'),
      };

    case 'databricks':
      return {
        ...baseFields,
        host: envVar('host'),
        http_path: envVar('httppath'),
        token: envVar('token'),
        catalog: envVar('catalog'),
        schema: envVar('schema'),
      };

    case 'duckdb':
      return {
        ...baseFields,
        path: connection.database_path,
        schema: connection.schema,
      };

    case 'ducklake':
      return {
        ...baseFields,
        // DuckLake uses DuckDB with extensions
        // These will be handled by the full generator in generateProfilesYml
        path: ':memory:',
        schema: 'main',
      };

    default:
      // @ts-ignore
      throw new Error(`Unsupported connection type: ${connection.type}`);
  }
}

/**
 * Generates the JDBC URL for main.conf
 * @param connection - Connection configuration
 * @param projectName - Name of the project (used for token references)
 */
function generateJdbcUrl(
  connection: ConnectionInput,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  projectName: string,
): string {
  const ev = (field: string) => `\${db-${field}-${connection.name}}`;
  switch (connection.type) {
    case 'postgres':
      return `jdbc:postgresql://${ev('host')}:${ev('port')}/${ev('dbname')}?currentSchema=${ev('schema')}`;

    case 'snowflake':
      return `jdbc:snowflake://${ev('account')}.snowflakecomputing.com/?warehouse=${ev('warehouse')}&db=${ev('dbname')}&schema=${ev('schema')}`;

    case 'redshift':
      return `jdbc:redshift://${ev('host')}:${ev('port')}/${ev('dbname')}?currentSchema=${ev('schema')}`;

    case 'bigquery':
      return `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${ev('project')};OAuthType=0;OAuthServiceAcctEmail=${ev('bigquery-email')};OAuthPvtKeyPath=${ev('bigquery')};`;

    case 'databricks':
      return `jdbc:databricks://${ev('host')}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${ev('httppath')};PWD=${ev('token')}`;

    case 'duckdb':
      return `jdbc:duckdb:${connection.database_path}`;

    case 'ducklake':
      return `jdbc:duckdb:`; // In-memory DuckDB

    default:
      // @ts-ignore
      throw new Error(`Unsupported connection type: ${connection.type}`);
  }
}

/**
 * Partially updates profiles.yml by preserving custom fields
 *
 * @param projectPath - Path to the dbt project
 * @param projectName - Name of the project
 * @param connection - Connection details to update
 * @throws PartialUpdateError if file doesn't exist or cannot be parsed
 */
export async function updateProfilesYml(
  projectPath: string,
  projectName: string,
  connection: ConnectionInput,
): Promise<void> {
  const profilesPath = path.join(projectPath, 'profiles.yml');

  // Check if file exists
  if (!fs.existsSync(profilesPath)) {
    throw new PartialUpdateError(
      `profiles.yml not found at ${profilesPath}. The file may have been deleted. Please reconfigure the connection to regenerate it.`,
      profilesPath,
    );
  }

  try {
    // Read and parse existing file
    const existingContent = await fs.promises.readFile(profilesPath, 'utf8');
    const profiles = yaml.load(existingContent) as any;

    if (!profiles || typeof profiles !== 'object') {
      throw new PartialUpdateError(
        `profiles.yml has invalid structure. Expected object, got ${typeof profiles}`,
        profilesPath,
      );
    }

    // Ensure project profile exists
    if (!profiles[projectName]) {
      profiles[projectName] = {
        target: 'dev',
        outputs: {},
      };
    }

    // Ensure outputs.dev exists
    if (!profiles[projectName].outputs) {
      profiles[projectName].outputs = {};
    }

    if (!profiles[projectName].outputs.dev) {
      profiles[projectName].outputs.dev = {};
    }

    // Get new connection fields
    const newFields = generateProfileOutputFields(connection);

    // Merge new fields into existing dev output, preserving custom fields
    profiles[projectName].outputs.dev = {
      ...profiles[projectName].outputs.dev, // Keep existing custom fields
      ...newFields, // Override with new connection fields
    };

    // Write back to file
    const updatedContent = yaml.dump(profiles, {
      indent: 2,
      lineWidth: -1, // Don't wrap lines
      noRefs: true, // Don't use anchors/aliases
    });

    await fs.promises.writeFile(profilesPath, updatedContent, 'utf8');
  } catch (error) {
    if (error instanceof PartialUpdateError) {
      throw error;
    }

    throw new PartialUpdateError(
      `Failed to parse or update profiles.yml: ${error instanceof Error ? error.message : 'Unknown error'}`,
      profilesPath,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Partially updates main.conf by preserving custom fields
 *
 * @param projectPath - Path to the dbt project
 * @param projectName - Name of the project
 * @param connection - Connection details to update
 * @throws PartialUpdateError if file doesn't exist or cannot be parsed
 */
export async function updateMainConf(
  projectPath: string,
  projectName: string,
  connection: ConnectionInput,
): Promise<void> {
  if (connection.type === 'ducklake') {
    return;
  }
  const mainConfPath = path.join(projectPath, 'rosetta', 'main.conf');

  // Check if file exists
  if (!fs.existsSync(mainConfPath)) {
    throw new PartialUpdateError(
      `main.conf not found at ${mainConfPath}. The file may have been deleted. Please reconfigure the connection to regenerate it.`,
      mainConfPath,
    );
  }

  try {
    // Read and parse existing file
    const existingContent = await fs.promises.readFile(mainConfPath, 'utf8');
    const mainConf = yaml.load(existingContent) as any;

    if (!mainConf || typeof mainConf !== 'object') {
      throw new PartialUpdateError(
        `main.conf has invalid structure. Expected object, got ${typeof mainConf}`,
        mainConfPath,
      );
    }

    // Ensure connections array exists
    if (!mainConf.connections || !Array.isArray(mainConf.connections)) {
      mainConf.connections = [];
    }

    // Find the connection entry for this project (by name)
    let connectionEntry = mainConf.connections.find(
      (conn: any) => conn.name === projectName,
    );

    if (!connectionEntry) {
      // Create new connection entry if it doesn't exist
      connectionEntry = { name: projectName };
      mainConf.connections.push(connectionEntry);
    }

    const ev = (field: string) => `\${db-${field}-${connection.name}}`;
    // Determine database name based on connection type
    const databaseName =
      connection.type === 'duckdb'
        ? extractDbNameFromPath(connection.database_path)
        : ev(connection.type === 'bigquery' ? 'project' : 'dbname');

    // Update connection fields (preserve other custom fields in connectionEntry)
    connectionEntry.databaseName = databaseName;
    connectionEntry.schemaName =
      connection.type === 'duckdb'
        ? connection.schema
        : ev(connection.type === 'bigquery' ? 'dataset' : 'schema');
    connectionEntry.dbType = connection.type;
    connectionEntry.url = generateJdbcUrl(connection, projectName);

    // Handle userName and password (some connection types don't use them)
    const typesWithoutCredentials = ['bigquery', 'databricks', 'duckdb'];
    if (!typesWithoutCredentials.includes(connection.type)) {
      connectionEntry.userName = ev('user');
      connectionEntry.password = ev('password');
    } else {
      // Remove userName/password if they exist but shouldn't for this type
      delete connectionEntry.userName;
      delete connectionEntry.password;
    }

    // For Databricks, handle token
    if (connection.type === 'databricks') {
      // Token is embedded in JDBC URL, not as separate field
      // Just ensure it's not duplicated
      delete connectionEntry.token;
    }

    // Write back to file
    const updatedContent = yaml.dump(mainConf, {
      indent: 2,
      lineWidth: -1,
      noRefs: true,
    });

    await fs.promises.writeFile(mainConfPath, updatedContent, 'utf8');
  } catch (error) {
    if (error instanceof PartialUpdateError) {
      throw error;
    }

    throw new PartialUpdateError(
      `Failed to parse or update main.conf: ${error instanceof Error ? error.message : 'Unknown error'}`,
      mainConfPath,
      error instanceof Error ? error : undefined,
    );
  }
}

/**
 * Updates both profiles.yml and main.conf for a project
 *
 * @param projectPath - Path to the dbt project
 * @param projectName - Name of the project
 * @param connection - Connection details to update
 * @returns Object with success status and any errors encountered
 */
export async function updateProjectConfigFiles(
  projectPath: string,
  projectName: string,
  connection: ConnectionInput,
): Promise<{ success: boolean; errors: string[] }> {
  if (connection.type === 'ducklake') {
    return { success: true, errors: [] };
  }
  const errors: string[] = [];

  // Update profiles.yml
  try {
    await updateProfilesYml(projectPath, projectName, connection);
  } catch (error) {
    if (error instanceof PartialUpdateError) {
      errors.push(`profiles.yml: ${error.message}`);
    } else {
      errors.push(
        `profiles.yml: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Update main.conf
  try {
    await updateMainConf(projectPath, projectName, connection);
  } catch (error) {
    if (error instanceof PartialUpdateError) {
      errors.push(`main.conf: ${error.message}`);
    } else {
      errors.push(
        `main.conf: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}
