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
import { getDbtConnector } from '../../connections/registry.main';

const dbtConnectorOrThrow = (connection: ConnectionInput) => {
  const connector = getDbtConnector(connection.type);
  if (!connector) {
    throw new Error(`Unsupported connection type: ${connection.type}`);
  }
  return connector;
};

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

    const connector = dbtConnectorOrThrow(connection);
    const newFields = await connector.profilePatch(connection);

    // Merge new fields into existing dev output, preserving custom fields
    profiles[projectName].outputs.dev = {
      ...profiles[projectName].outputs.dev, // Keep existing custom fields
      ...newFields, // Override with new connection fields
    };

    // Keys the merge would keep but the connection no longer uses (Snowflake auth switch).
    connector.profileKeysToRemove(connection).forEach((key) => {
      delete profiles[projectName].outputs.dev[key];
    });

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
  if (getDbtConnector(connection.type)?.supportsPartialUpdate === false) {
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

    const connector = dbtConnectorOrThrow(connection);
    const entry = await connector.mainConfPatch(connection, projectName);

    // Update connection fields (preserve other custom fields in connectionEntry)
    connectionEntry.databaseName = entry.databaseName;
    connectionEntry.schemaName = entry.schemaName;
    connectionEntry.dbType = entry.dbType;
    connectionEntry.url = entry.url;

    // Credentials: set what the connection uses, remove what it doesn't.
    ['userName', 'password', 'authenticator'].forEach((key) => {
      if (key in entry) {
        connectionEntry[key] = entry[key];
      } else {
        delete connectionEntry[key];
      }
    });

    connector.mainConfKeysToRemove(connection).forEach((key) => {
      delete connectionEntry[key];
    });

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
  if (getDbtConnector(connection.type)?.supportsPartialUpdate === false) {
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
