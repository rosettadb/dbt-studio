/* eslint-disable no-case-declarations, @typescript-eslint/no-shadow, no-restricted-syntax, no-await-in-loop */
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidV4 } from 'uuid';
import { NotebooksService } from './notebooks.service';
import {
  BigQueryConnection,
  ConnectionTestResult,
  ConnectionInput,
  ConnectorTestResponse,
  ConnectionModel,
  DatabricksConnection,
  DBTConnection,
  DuckDBConnection,
  DuckLakeConnectionConfig,
  ExecuteStatementType,
  KineticaConnection,
  PostgresConnection,
  Project,
  QueryResponseType,
  RedshiftConnection,
  RosettaConnection,
  SnowflakeAuthMethod,
  SnowflakeConnection,
} from '../../types/backend';
import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import { ProjectsService } from './index';
import MainDatabaseService from './mainDatabase.service';
import { ConfigureConnectionBody, UpdateConnectionBody } from '../../types/ipc';
import {
  executeBigQueryQuery,
  executeDatabricksQuery,
  executeDuckDBQuery,
  executePostgresQuery,
  executeRedshiftQuery,
  executeSnowflakeQuery,
  testBigQueryConnection,
  testDatabricksConnection,
  testDuckDBConnection,
  testPostgresConnection,
  testRedshiftConnection,
  testSnowflakeConnection,
  testKineticaConnection,
  executeKineticaQuery,
} from '../utils/connectors';
import SecureStorageService from './secureStorage.service';
import { CloudConnection, RecentItem } from '../../types/frontend';
import { updateProjectConfigFiles } from '../utils/yamlPartialUpdate';
import DuckLakeService from './duckLake.service';
import DuckLakeInstanceStore from './duckLake/instanceStore.service';

export default class ConnectorsService {
  private static getSnowflakeAuthMethod(
    connection: SnowflakeConnection,
  ): SnowflakeAuthMethod {
    return connection.authMethod === 'web_browser' ? 'web_browser' : 'password';
  }

  private static logSnowflakeTestFailure(
    connection: SnowflakeConnection,
    result: ConnectionTestResult,
  ): void {
    // eslint-disable-next-line no-console
    console.error('[ConnectorsService] Snowflake test connection failed', {
      scope: 'connectors',
      provider: 'snowflake',
      operation: 'testConnection',
      authMethod: this.getSnowflakeAuthMethod(connection),
      account: connection.account,
      username: connection.username,
      warehouse: connection.warehouse,
      database: connection.database,
      schema: connection.schema,
      code: result.code,
      message: result.message,
      details: result.details,
    });
  }

  static async loadConnections(
    includeDataLake: boolean = false,
  ): Promise<ConnectionModel[]> {
    const db = await loadDatabaseFile();
    const connections = db.connections ?? [];

    // Filter out ducklake connections by default
    if (includeDataLake) {
      return connections;
    }

    return connections.filter((conn) => conn.connection.type !== 'ducklake');
  }

  static async getConnectionById(
    connectionId: string,
  ): Promise<ConnectionModel | undefined> {
    const connections = await this.loadConnections(true); // Include all connections including ducklake
    return connections.find((connection) => connection.id === connectionId);
  }

  /**
   * Find a connection by name (case-insensitive)
   */
  static async findConnectionByName(
    name: string,
  ): Promise<ConnectionModel | undefined> {
    const connections = await this.loadConnections(true); // Include all connections including ducklake
    return connections.find(
      (conn) =>
        conn.connection.name.toLowerCase().trim() === name.toLowerCase().trim(),
    );
  }

  /**
   * Compare two connection configurations to determine if they represent the same connection
   * Used to prevent incorrect connection reuse when cloning projects
   */
  private static areConnectionConfigsEqual(
    conn1: ConnectionInput,
    conn2: ConnectionInput,
  ): boolean {
    // Different types means different connections
    if (conn1.type !== conn2.type) {
      return false;
    }

    // Compare based on connection type
    switch (conn1.type) {
      case 'duckdb':
        return (
          conn1.database_path === (conn2 as DuckDBConnection).database_path &&
          conn1.schema === (conn2 as DuckDBConnection).schema
        );

      case 'ducklake':
        return (
          conn1.instanceId === (conn2 as DuckLakeConnectionConfig).instanceId
        );

      case 'postgres':
        return (
          (conn1 as PostgresConnection).host ===
            (conn2 as PostgresConnection).host &&
          (conn1 as PostgresConnection).port ===
            (conn2 as PostgresConnection).port &&
          (conn1 as PostgresConnection).database ===
            (conn2 as PostgresConnection).database &&
          (conn1 as PostgresConnection).username ===
            (conn2 as PostgresConnection).username &&
          (conn1 as PostgresConnection).schema ===
            (conn2 as PostgresConnection).schema
        );

      case 'snowflake':
        return (
          (conn1 as SnowflakeConnection).account ===
            (conn2 as SnowflakeConnection).account &&
          (conn1 as SnowflakeConnection).database ===
            (conn2 as SnowflakeConnection).database &&
          (conn1 as SnowflakeConnection).username ===
            (conn2 as SnowflakeConnection).username &&
          (conn1 as SnowflakeConnection).warehouse ===
            (conn2 as SnowflakeConnection).warehouse &&
          (conn1 as SnowflakeConnection).schema ===
            (conn2 as SnowflakeConnection).schema &&
          this.getSnowflakeAuthMethod(conn1 as SnowflakeConnection) ===
            this.getSnowflakeAuthMethod(conn2 as SnowflakeConnection)
        );

      case 'bigquery':
        return (
          (conn1 as BigQueryConnection).project ===
            (conn2 as BigQueryConnection).project &&
          (conn1 as BigQueryConnection).database ===
            (conn2 as BigQueryConnection).database &&
          (conn1 as BigQueryConnection).schema ===
            (conn2 as BigQueryConnection).schema &&
          (conn1 as BigQueryConnection).keyfile ===
            (conn2 as BigQueryConnection).keyfile
        );

      case 'redshift':
        return (
          (conn1 as RedshiftConnection).host ===
            (conn2 as RedshiftConnection).host &&
          (conn1 as RedshiftConnection).port ===
            (conn2 as RedshiftConnection).port &&
          (conn1 as RedshiftConnection).database ===
            (conn2 as RedshiftConnection).database &&
          (conn1 as RedshiftConnection).username ===
            (conn2 as RedshiftConnection).username &&
          (conn1 as RedshiftConnection).schema ===
            (conn2 as RedshiftConnection).schema
        );

      case 'databricks':
        return (
          (conn1 as DatabricksConnection).host ===
            (conn2 as DatabricksConnection).host &&
          (conn1 as DatabricksConnection).httpPath ===
            (conn2 as DatabricksConnection).httpPath &&
          (conn1 as DatabricksConnection).database ===
            (conn2 as DatabricksConnection).database &&
          (conn1 as DatabricksConnection).schema ===
            (conn2 as DatabricksConnection).schema
        );

      case 'kinetica':
        return (
          (conn1 as KineticaConnection).host ===
            (conn2 as KineticaConnection).host &&
          (conn1 as KineticaConnection).port ===
            (conn2 as KineticaConnection).port &&
          (conn1 as KineticaConnection).useSSL ===
            (conn2 as KineticaConnection).useSSL &&
          (conn1 as KineticaConnection).database ===
            (conn2 as KineticaConnection).database &&
          (conn1 as KineticaConnection).username ===
            (conn2 as KineticaConnection).username &&
          (conn1 as KineticaConnection).schema ===
            (conn2 as KineticaConnection).schema &&
          (conn1 as KineticaConnection).timeout ===
            (conn2 as KineticaConnection).timeout &&
          (conn1 as KineticaConnection).bypassSslCertCheck ===
            (conn2 as KineticaConnection).bypassSslCertCheck
        );

      default:
        return false;
    }
  }

  /**
   * Generate a unique connection name based on connection details
   * Used when a connection with the default name exists but has different config
   */
  private static generateUniqueConnectionName(
    connection: ConnectionInput,
  ): string {
    const timestamp = Date.now();
    let baseName = 'DBT Connection';

    // Try to use database name or path as part of the unique name
    // eslint-disable-next-line default-case
    switch (connection.type) {
      case 'duckdb': {
        const duckConn = connection as DuckDBConnection;
        // Extract filename from path if available
        const fileName = path.basename(duckConn.database_path, '.duckdb');
        baseName = fileName || duckConn.name;
        break;
      }
      case 'postgres':
      case 'redshift':
        baseName = connection.database;
        break;
      case 'snowflake':
        baseName = `${connection.database}`;
        break;
      case 'bigquery':
        baseName = (connection as BigQueryConnection).project;
        break;
      case 'databricks':
        baseName = connection.database;
        break;
      case 'kinetica':
        baseName = connection.database || 'kinetica';
        break;
    }

    return `${baseName}_${timestamp}`;
  }

  /**
   * Save a new connection, allowing reserved names for Getting Started template
   */
  static async saveNewConnectionForTemplate(
    connection: ConnectionInput,
    allowReservedNames: boolean = false,
  ): Promise<string> {
    const connections = await this.loadConnections(true); // Include all connections including ducklake

    // Validate connection name with optional allowReservedNames flag
    const nameValidation = this.validateConnectionName(
      connection.name,
      connections,
      undefined,
      allowReservedNames,
    );

    if (!nameValidation.isValid) {
      throw new Error(nameValidation.message);
    }

    const connectionId = uuidV4();
    const newConnection: ConnectionModel = {
      id: connectionId,
      connection,
    };
    await updateDatabase<'connections'>('connections', [
      ...connections,
      newConnection,
    ]);
    return connectionId;
  }

  static async saveNewConnection(connection: ConnectionInput): Promise<string> {
    const connections = await this.loadConnections(true); // Include all connections including ducklake

    // Validate connection name
    const nameValidation = this.validateConnectionName(
      connection.name,
      connections,
    );

    if (!nameValidation.isValid) {
      throw new Error(nameValidation.message);
    }

    const connectionId = uuidV4();

    // For ducklake connections, store S3 credentials securely
    if (connection.type === 'ducklake') {
      const instance = await DuckLakeService.getInstance(connection.instanceId);
      const credentials = await DuckLakeInstanceStore.retrieveCredentials(
        instance.id,
        instance.catalog as any,
        instance.storage as any,
      );

      // Store S3 credentials in secure storage if they exist
      if (credentials.storage?.type === 's3' && credentials.storage.s3) {
        await SecureStorageService.setCredential(
          `db-s3-region-${connection.name}`,
          credentials.storage.s3.region,
        );
        await SecureStorageService.setCredential(
          `db-s3-access-key-${connection.name}`,
          credentials.storage.s3.accessKeyId,
        );
        await SecureStorageService.setCredential(
          `db-s3-secret-key-${connection.name}`,
          credentials.storage.s3.secretAccessKey,
        );
        if (credentials.storage.s3.sessionToken) {
          await SecureStorageService.setCredential(
            `db-s3-session-token-${connection.name}`,
            credentials.storage.s3.sessionToken,
          );
        }
      }
    }

    const newConnection: ConnectionModel = {
      id: connectionId,
      connection,
    };
    await updateDatabase<'connections'>('connections', [
      ...connections,
      newConnection,
    ]);
    return connectionId;
  }

  static async getProjectById(projectId: string): Promise<Project | undefined> {
    const { projects } = await loadDatabaseFile();
    return projects.find((p) => p.id === projectId);
  }

  static async loadConfigurations(projectId: string): Promise<Project> {
    const project = await this.getProjectById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }
    if (!project?.connectionId) {
      return project;
    }
    const connections = await this.loadConnections(true); // Include all connections including ducklake
    const connection = connections.find((c) => c.id === project.connectionId);

    if (!connection) {
      throw new Error('Missing connection');
    }

    // Load credentials into environment variables for ducklake S3 connections
    if (connection.connection.type === 'ducklake') {
      const s3Region = await SecureStorageService.getCredential(
        `db-s3-region-${connection.connection.name}`,
      );
      const s3AccessKey = await SecureStorageService.getCredential(
        `db-s3-access-key-${connection.connection.name}`,
      );
      const s3SecretKey = await SecureStorageService.getCredential(
        `db-s3-secret-key-${connection.connection.name}`,
      );
      const s3SessionToken = await SecureStorageService.getCredential(
        `db-s3-session-token-${connection.connection.name}`,
      );

      if (s3Region) {
        process.env[`db-s3-region-${connection.connection.name}`] = s3Region;
      }
      if (s3AccessKey) {
        process.env[`db-s3-access-key-${connection.connection.name}`] =
          s3AccessKey;
      }
      if (s3SecretKey) {
        process.env[`db-s3-secret-key-${connection.connection.name}`] =
          s3SecretKey;
      }
      if (s3SessionToken) {
        process.env[`db-s3-session-token-${connection.connection.name}`] =
          s3SessionToken;
      }
    }

    const rosettaConnection = await this.mapToRosettaConnection(
      connection.connection,
      project,
    );
    const dbtConnection = this.mapToDbtConnection(connection.connection);

    const profilesPath = path.join(project.path, 'profiles.yml');
    const profilesContent = await this.generateProfilesYml(
      project.name,
      connection.connection,
    );
    await fs.promises.writeFile(profilesPath, profilesContent, 'utf8');

    // Ensure rosetta directory exists before writing main.conf
    const rosettaDir = path.join(project.path, 'rosetta');
    await fs.promises.mkdir(rosettaDir, { recursive: true });

    const mainConfPath = path.join(rosettaDir, 'main.conf');
    const rosettaYaml = await this.generateRosettaYml(
      connection.connection,
      project.name,
    );
    await fs.promises.writeFile(mainConfPath, rosettaYaml, 'utf8');
    return {
      ...project,
      rosettaConnection: {
        ...rosettaConnection,
        name: project.name,
      },
      dbtConnection,
    };
  }

  /**
   * Configure a connection for a specific project
   */
  static async configureConnection({
    projectId,
    connection: conn,
    connectionId: connId,
  }: ConfigureConnectionBody): Promise<string> {
    const projects = await ProjectsService.loadProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);

    const connections = await this.loadConnections(true); // Include all connections including ducklake
    let connectionId = connId;
    const connection =
      conn ?? connections?.find((c) => c.id === connectionId)?.connection;

    if (!connection) {
      throw new Error('Connection not found!');
    }

    await this.validateConnection(connection);

    if (!connectionId) {
      // Allow reserved name "DBT Connection" for Getting Started template
      const isTemplateConnection =
        connection.name.toLowerCase().trim() === 'dbt connection';
      if (isTemplateConnection) {
        // Check if a connection with the reserved name already exists
        const existingConnection = await this.findConnectionByName(
          connection.name,
        );
        if (existingConnection) {
          // Only reuse if the connection configurations actually match
          // This prevents different projects from sharing connections with different configs
          const configsMatch = this.areConnectionConfigsEqual(
            connection,
            existingConnection.connection,
          );
          if (configsMatch) {
            // Reuse existing connection for the starter project
            connectionId = existingConnection.id;
          } else {
            // Configs don't match - create new connection with unique name
            // Generate a unique name based on the database details
            const uniqueName = this.generateUniqueConnectionName(connection);
            connectionId = await this.saveNewConnection({
              ...connection,
              name: uniqueName,
            });
          }
        } else {
          // Create new connection if none exists
          connectionId = await this.saveNewConnectionForTemplate(
            connection,
            true,
          );
        }
      } else {
        connectionId = await this.saveNewConnection(connection);
      }
    }

    if (projectIndex !== -1) {
      const currentProject = projects[projectIndex];
      await ProjectsService.updateProject({
        ...currentProject,
        connectionId,
      });

      await this.loadConfigurations(currentProject.id);
    }

    if (!connectionId) {
      throw new Error('Failed to create or find connection');
    }

    return connectionId;
  }

  /**
   * Configure a connection for a specific project
   */
  static async updateConnection({
    connection,
  }: UpdateConnectionBody): Promise<void> {
    await this.validateConnection(connection.connection);

    const connections = await this.loadConnections(true); // Include all connections including ducklake

    // Validate connection name (exclude current connection from uniqueness check)
    const nameValidation = this.validateConnectionName(
      connection.connection.name,
      connections,
      connection.id,
    );

    if (!nameValidation.isValid) {
      throw new Error(nameValidation.message);
    }

    const connectionIndex = connections.findIndex(
      (c) => c.id === connection.id,
    );

    if (connectionIndex === -1) {
      throw new Error('Connection not found');
    }

    connections[connectionIndex] = connection;
    await updateDatabase<'connections'>('connections', connections);

    // Find all projects using this connection and update their config files
    const projects = await ProjectsService.loadProjects();
    const affectedProjects = projects.filter(
      (project) => project.connectionId === connection.id,
    );

    // Track errors for each project
    const updateErrors: Array<{ projectName: string; errors: string[] }> = [];

    for (const project of affectedProjects) {
      try {
        const result = await updateProjectConfigFiles(
          project.path,
          project.name,
          connection.connection,
        );

        if (!result.success) {
          updateErrors.push({
            projectName: project.name,
            errors: result.errors,
          });
        }
      } catch (error) {
        updateErrors.push({
          projectName: project.name,
          errors: [
            error instanceof Error ? error.message : 'Unknown error occurred',
          ],
        });
      }
    }

    // If there were any errors updating config files, throw an error with details
    if (updateErrors.length > 0) {
      const errorMessages = updateErrors
        .map(
          ({ projectName, errors }) =>
            `Project "${projectName}":\n${errors.map((e) => `  - ${e}`).join('\n')}`,
        )
        .join('\n\n');

      throw new Error(
        `Connection updated in database, but failed to update configuration files for some projects:\n\n${errorMessages}\n\nPlease check that the profiles.yml and main.conf files exist and are not corrupted. You may need to reconfigure the connection for these projects.`,
      );
    }
  }

  /**
   * Delete a connection if it's not being used by any projects
   */
  static async deleteConnection(connectionId: string): Promise<void> {
    // Check if the connection exists
    const connections = await this.loadConnections(true); // Include all connections including ducklake
    const connectionIndex = connections.findIndex(
      (connection) => connection.id === connectionId,
    );

    if (connectionIndex === -1) {
      throw new Error('Connection not found');
    }

    const connectionToDelete = connections[connectionIndex];

    // Check if any projects are using this connection
    const projects = await ProjectsService.loadProjects();
    const projectsUsingConnection = projects.filter(
      (project) => project.connectionId === connectionId,
    );

    if (projectsUsingConnection.length > 0) {
      const projectNames = projectsUsingConnection
        .map((p) => p.name)
        .join(', ');
      throw new Error(
        `Cannot delete connection. It is currently being used by the following project(s): ${projectNames}. Please remove the connection from these projects first.`,
      );
    }

    // Clean up connection-specific credentials from secure storage
    try {
      await SecureStorageService.cleanupConnectionCredentials(
        connectionToDelete.id,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to cleanup credentials for connection ${connectionToDelete.connection.name}:`,
        error,
      );
    }

    // Archive notebooks for this connection
    // If archival fails, abort the deletion to prevent orphaned notebooks
    await NotebooksService.archiveConnectionNotebooks(connectionToDelete.id);

    // Remove the connection from the database
    const updatedConnections = connections.filter(
      (connection) => connection.id !== connectionId,
    );

    await updateDatabase<'connections'>('connections', updatedConnections);

    // Only clean up AI chats after the connection deletion is persisted.
    try {
      await MainDatabaseService.deleteConversationsByConnection(connectionId);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[ConnectorsService] Failed to clean up AI chats:', error);
    }
  }

  /**
   * Test a connection configuration
   */
  static async testConnection(
    connection: ConnectionInput,
  ): Promise<ConnectorTestResponse> {
    await this.validateConnection(connection);
    switch (connection.type) {
      case 'postgres':
        return testPostgresConnection(connection);
      case 'snowflake':
        const result = await testSnowflakeConnection(connection);
        if (!result.ok) {
          this.logSnowflakeTestFailure(connection, result);
        }
        return result;
      case 'bigquery':
        return testBigQueryConnection(connection);
      case 'databricks':
        return testDatabricksConnection(connection);
      case 'duckdb':
        return testDuckDBConnection(connection);
      case 'ducklake':
        // DuckLake connection test - validate instance exists
        try {
          const instance = await DuckLakeService.getInstance(
            connection.instanceId,
          );
          if (!instance || !instance.id) {
            return false;
          }
          return true;
        } catch (error) {
          return false;
        }
      case 'redshift':
        return testRedshiftConnection(connection);
      case 'kinetica':
        return testKineticaConnection(connection);
      default:
        throw new Error(
          `Unsupported connection type: ${(connection as any).type}`,
        );
    }
  }

  private static runningQueries = new Map<string, () => void>();

  static async cancelQuery(queryId: string): Promise<void> {
    const cancelFn = this.runningQueries.get(queryId);
    if (cancelFn) {
      // Execute the cancellation function (closes connection/client)
      cancelFn();
      this.runningQueries.delete(queryId);
    }
  }

  /**
   * Run a select statement and expect the results and fields
   */
  static async executeSelectStatement({
    connection,
    query,
    projectName,
    queryId,
  }: ExecuteStatementType): Promise<QueryResponseType> {
    const storeUser = await SecureStorageService.getCredential(
      `db-user-${projectName}`,
    );
    const storePassword = await SecureStorageService.getCredential(
      `db-password-${projectName}`,
    );

    const storeToken = await SecureStorageService.getCredential(
      `db-token-${projectName}`,
    );

    const bigQueryKey = await SecureStorageService.getCredential(
      `db-bigquery-${projectName}`,
    );

    if (storeUser) {
      (connection as any).username = storeUser;
    }
    if (storePassword) {
      (connection as any).password = storePassword;
    }
    if (storeToken) {
      (connection as any).token = storeToken;
    }

    if (bigQueryKey) {
      (connection as any).keyfile = bigQueryKey;
    }

    const startTime = Date.now();
    let response: QueryResponseType;

    // Helper to register cancel callback if queryId is present
    const registerCancel = queryId
      ? (fn: () => void) => {
          this.runningQueries.set(queryId, fn);
        }
      : undefined;

    try {
      switch (connection.type) {
        case 'postgres':
          response = await executePostgresQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        case 'snowflake':
          response = await executeSnowflakeQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        case 'bigquery':
          // BigQuery cancellation not yet implemented in utils
          response = await executeBigQueryQuery(connection, query);
          break;
        case 'databricks':
          response = await executeDatabricksQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        case 'duckdb':
          response = await executeDuckDBQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        case 'redshift':
          response = await executeRedshiftQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        case 'ducklake':
          response = {
            success: false,
            error: 'DuckLake query execution not yet implemented',
          };
          break;
        case 'kinetica':
          response = await executeKineticaQuery(
            connection,
            query,
            registerCancel,
          );
          break;
        default:
          throw new Error(
            `Unsupported connection type: ${(connection as any).type}`,
          );
      }
    } finally {
      // Clean up running query registry
      if (queryId) {
        this.runningQueries.delete(queryId);
      }
    }

    response.duration = Date.now() - startTime;
    return response;
  }

  static extractDbNameFromPath = (url: string) => {
    return path.parse(url).name;
  };

  static async generateRosettaYml(
    connection: ConnectionInput,
    projectName: string,
  ): Promise<string> {
    const jdbcUrl = await this.generateJdbcUrl(connection);
    const isDuckDb = connection.type === 'duckdb';
    const isDuckLake = connection.type === 'ducklake';
    const isBigQuery = connection.type === 'bigquery';
    const isDatabricks = connection.type === 'databricks';
    const ev = (field: string) => `\${db-${field}-${connection.name}}`;
    let databaseName: string;
    let schemaName: string;

    if (isDuckDb) {
      databaseName = this.extractDbNameFromPath(connection.short_database_path);
      schemaName = ev('schema');
    } else if (isDuckLake) {
      databaseName = projectName; // Use project name as database name for ducklake
      schemaName = 'main';
    } else if (isBigQuery) {
      databaseName = ev('project');
      schemaName = ev('dataset');
    } else if (isDatabricks) {
      databaseName = ev('catalog');
      schemaName = ev('schema');
    } else {
      databaseName = ev('dbname');
      schemaName = ev('schema');
    }

    // Base connection config
    const connectionConfig: any = {
      name: projectName,
      databaseName,
      schemaName,
      dbType: connection.type,
      url: jdbcUrl,
    };

    // Handle ducklake-specific configuration
    if (isDuckLake) {
      const instance = await DuckLakeService.getInstance(connection.instanceId);

      // Get credentials if available
      const credentials = await DuckLakeInstanceStore.retrieveCredentials(
        instance.id,
        instance.catalog as any,
        instance.storage as any,
      );

      connectionConfig.ducklakeDataPath = instance.dataPath;

      // Metadata DB path (from catalog config)
      if (
        instance.catalog.type === 'duckdb' &&
        instance.catalog.duckdb?.metadataPath
      ) {
        connectionConfig.ducklakeMetadataDb =
          instance.catalog.duckdb.metadataPath;
      } else if (
        instance.catalog.type === 'sqlite' &&
        instance.catalog.sqlite?.metadataPath
      ) {
        connectionConfig.ducklakeMetadataDb =
          instance.catalog.sqlite.metadataPath;
      }

      // Add S3 credentials if storage is S3 - use env vars for security
      if (credentials.storage?.type === 's3' && credentials.storage.s3) {
        connectionConfig.s3Region = `\${db-s3-region-${connection.name}}`;
        connectionConfig.s3AccessKeyId = `\${db-s3-access-key-${connection.name}}`;
        connectionConfig.s3SecretAccessKey = `\${db-s3-secret-key-${connection.name}}`;
      }
    } else if (
      connection.type !== 'databricks' &&
      connection.type !== 'duckdb' &&
      connection.type !== 'bigquery'
    ) {
      // Only add userName/password for non-BigQuery, non-Databricks, non-DuckDB, non-ducklake
      connectionConfig.userName = ev('user');
      if (
        connection.type === 'snowflake' &&
        this.getSnowflakeAuthMethod(connection) === 'web_browser'
      ) {
        connectionConfig.authenticator = 'externalbrowser';
      } else {
        connectionConfig.password = ev('password');
      }
    }

    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      openai_api_key: `\${openai-api-key}`,
      connections: [connectionConfig],
    };
    return yaml.dump(yamlData);
  }

  static async validateConnection(conn: ConnectionInput): Promise<void> {
    if (!conn.type) {
      throw new Error('Connection type is required');
    }

    switch (conn.type) {
      case 'postgres':
      case 'redshift':
        if (!conn.host) throw new Error('Host is required');
        if (!conn.port) throw new Error('Port is required');
        break;
      case 'snowflake':
        if (!conn.account) throw new Error('Snowflake account is required');
        if (!('warehouse' in conn)) throw new Error('Warehouse is required');
        if (!conn.username) throw new Error('Username is required');
        if (
          this.getSnowflakeAuthMethod(conn) === 'password' &&
          !conn.password
        ) {
          throw new Error('Password is required for Snowflake password auth');
        }
        break;
      case 'bigquery':
        if (!('project' in conn)) throw new Error('Project ID is required');
        break;
      case 'databricks':
        if (!conn.host) throw new Error('Host is required');
        if (!('httpPath' in conn)) throw new Error('HTTP Path is required');
        if (!conn.token) throw new Error('Access token is required');
        break;
      case 'duckdb':
        // DuckDB specific validations
        if (!conn.database_path) throw new Error('Database path is required');
        break;
      case 'ducklake':
        // DuckLake specific validations
        if (!conn.instanceId)
          throw new Error('DuckLake instance ID is required');
        break;
      case 'kinetica':
        if (!conn.host) throw new Error('Host is required');
        if (!conn.port) throw new Error('Port is required');
        break;
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  static async generateJdbcUrl(conn: ConnectionInput): Promise<string> {
    const ev = (field: string) => `\${db-${field}-${conn.name}}`;
    switch (conn.type) {
      case 'postgres': {
        let postgresUrl = `jdbc:postgresql://${ev('host')}:${ev('port')}/${ev('dbname')}?currentSchema=${ev('schema')}`;
        if (conn.ssl) {
          postgresUrl += '&sslmode=require';
        }
        return postgresUrl;
      }
      case 'snowflake':
        return `jdbc:snowflake://${ev('account')}.snowflakecomputing.com/?warehouse=${ev('warehouse')}&db=${ev('dbname')}&schema=${ev('schema')}${this.getSnowflakeAuthMethod(conn) === 'web_browser' ? '&authenticator=externalbrowser' : ''}`;
      case 'redshift': {
        let redshiftUrl = `jdbc:redshift://${ev('host')}:${ev('port')}/${ev('dbname')}?currentSchema=${ev('schema')}`;

        // Add SSL parameters if enabled
        if (conn.ssl) {
          redshiftUrl += '&ssl=true';
          if (conn.sslrootcert) {
            redshiftUrl += `&sslrootcert=${conn.sslrootcert}`;
          }
        }
        return redshiftUrl;
      }
      case 'bigquery': {
        return `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${ev('project')};`;
      }
      case 'databricks':
        return `jdbc:databricks://${ev('host')}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${ev('httppath')};PWD=${ev('token')}`;
      case 'duckdb':
        // DuckDB JDBC URL format
        return `jdbc:duckdb:${conn.database_path}`;
      case 'ducklake':
        // DuckLake uses in-memory DuckDB session
        return `jdbc:duckdb:`;
      case 'kinetica': {
        // Kinetica JDBC URL format: jdbc:kinetica:URL=http://<host>:9191
        // Optional parameters can be appended
        const kineticaProtocol = conn.useSSL ? 'https:' : 'http:';
        const normalized = conn.host.match(/^https?:\/\//)
          ? conn.host
          : `${kineticaProtocol}//${conn.host}`;

        const urlObj = new URL(normalized);
        urlObj.protocol = kineticaProtocol;
        if (!urlObj.port && conn.port) {
          urlObj.port = String(conn.port);
        }

        const kineticaFinalUrl = `${urlObj.protocol}//${urlObj.hostname}${urlObj.port ? `:${urlObj.port}` : ''}${urlObj.pathname}`;
        let kineticaUrl = `jdbc:kinetica:URL=${kineticaFinalUrl}`;
        // Add additional params if needed (e.g., timeout)
        if (conn.timeout) {
          kineticaUrl += `;Timeout=${conn.timeout}`;
        }
        if (conn.bypassSslCertCheck && conn.useSSL) {
          kineticaUrl += ';BypassSslCertCheck=1';
        }
        return kineticaUrl;
      }
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  private static async mapToRosettaConnection(
    connection: ConnectionInput,
    project: Project,
  ): Promise<RosettaConnection> {
    const rosettaJdbcUrl = await this.generateJdbcUrl(connection);
    if (
      connection.type === 'bigquery' &&
      connection.method === 'service-account'
    ) {
      // Fetch the key from secure storage
      const key = await SecureStorageService.getCredential(
        `db-bigquery-${connection.name}`,
      );
      if (!key) {
        throw new Error(
          'BigQuery service account key not found in secure storage',
        );
      }
      (connection as any).keyfile = key;
    }

    return {
      name: connection.name || project.name,
      dbType: connection.type,
      databaseName: (() => {
        if (connection.type === 'duckdb') {
          return connection.database_path;
        }
        if (connection.type === 'ducklake') {
          return '';
        }
        return connection.database;
      })(),
      schemaName: connection.type === 'ducklake' ? '' : connection.schema,
      url: rosettaJdbcUrl,
      ...(connection.type !== 'databricks' &&
        connection.type !== 'duckdb' &&
        connection.type !== 'bigquery' &&
        'username' in connection &&
        (connection.type !== 'snowflake' ||
          this.getSnowflakeAuthMethod(connection) !== 'web_browser') && {
          userName: `db-user-${connection.name}`,
          password: `db-password-${connection.name}`,
        }),
      ...(connection.type === 'snowflake' &&
        this.getSnowflakeAuthMethod(connection) === 'web_browser' && {
          userName: `db-user-${connection.name}`,
          authenticator: 'externalbrowser',
        }),
    };
  }

  private static mapToDbtConnection(conn: ConnectionInput): DBTConnection {
    switch (conn.type) {
      case 'snowflake':
        if (this.getSnowflakeAuthMethod(conn) === 'web_browser') {
          return {
            type: 'snowflake',
            username: `db-user-${conn.name}`,
            database: conn.database,
            schema: conn.schema,
            account: conn.accountLocator || conn.account,
            warehouse: conn.warehouse,
            ...(conn.role && { role: conn.role }),
            authMethod: 'web_browser',
            authenticator: 'externalbrowser',
          };
        }
        return {
          type: 'snowflake',
          username: `db-user-${conn.name}`,
          password: `db-password-${conn.name}`,
          database: conn.database,
          schema: conn.schema,
          account: conn.account,
          warehouse: conn.warehouse,
          ...(conn.role && { role: conn.role }),
        };
      case 'bigquery':
        return {
          type: 'bigquery',
          username: conn.username,
          password: conn.password,
          database: conn.database,
          schema: conn.schema,
          method: conn.method,
          project: conn.project,
          ...(conn.keyfile && { keyfile: `db-bigquery-${conn.name}` }),
          ...(conn.location && { location: conn.location }),
          ...(conn.priority && { priority: conn.priority }),
        };
      case 'postgres':
        return {
          type: 'postgres',
          username: `db-user-${conn.name}`,
          password: `db-password-${conn.name}`,
          database: conn.database,
          schema: conn.schema,
          host: conn.host,
          port: conn.port,
          ssl: conn.ssl,
        };
      case 'redshift':
        return {
          type: 'redshift',
          username: `db-user-${conn.name}`,
          password: `db-password-${conn.name}`,
          database: conn.database,
          schema: conn.schema,
          host: conn.host,
          port: conn.port,
          ssl: conn.ssl,
          sslrootcert: conn.sslrootcert,
        };
      case 'databricks':
        // Special case for Databricks with token auth
        return {
          type: 'databricks',
          host: conn.host,
          port: conn.port,
          http_path: conn.httpPath,
          token: `db-token-${conn.name}`, // Use token directly
          database: conn.database,
          schema: conn.schema,
        };
      case 'duckdb':
        return {
          type: 'duckdb',
          path: conn.database_path, // Map database_path to path for DBT connection
          database: conn.database,
          schema: conn.schema,
        };
      case 'ducklake':
        // DuckLake uses DuckDB type for DBT
        return {
          type: 'duckdb',
          path: ':memory:', // In-memory DuckDB
          database: 'dl',
          schema: 'main',
        };
      case 'kinetica':
        return {
          type: 'kinetica',
          host: conn.host,
          port: conn.port,
          username: conn.username,
          password: conn.password,
          database: conn.database,
          schema: conn.schema,
          timeout: conn.timeout,
          useSSL: conn.useSSL,
          bypassSslCertCheck: conn.bypassSslCertCheck,
        };
      default:
        // Use type assertion to access the type property for error message
        throw new Error(
          `Unsupported connection type: ${(conn as ConnectionInput).type}`,
        );
    }
  }

  private static async mapToDbtProfiles(
    name: string,
    conn: ConnectionInput,
  ): Promise<string> {
    const profileConfig = {
      [name]: {
        target: 'dev',
        outputs: {
          dev: await this.mapToDbtProfileOutput(conn),
        },
      },
    };

    return yaml.dump(profileConfig);
  }

  static async generateProfilesYml(
    name: string,
    connection: ConnectionInput,
  ): Promise<string> {
    // If BigQuery, write key to temp file and set env var
    if (
      connection.type === 'bigquery' &&
      connection.method === 'service-account'
    ) {
      let { keyfile } = connection;
      if (!keyfile) {
        keyfile =
          (await SecureStorageService.getCredential(
            `db-bigquery-${connection.name}`,
          )) || '';
        if (!keyfile) {
          throw new Error(
            'BigQuery service account key not found in secure storage',
          );
        }
      }
      const tempKeyPath = path.join(
        os.tmpdir(),
        `dbt_bq_key_${connection.name}_${Date.now()}.json`,
      );
      fs.writeFileSync(tempKeyPath, keyfile, { mode: 0o600 });
      process.env[`db-bigquery-${connection.name}`] = tempKeyPath;
      // Optionally, schedule cleanup after dbt run
    }
    return this.mapToDbtProfiles(name, connection);
  }

  private static async mapToDbtProfileOutput(
    conn: ConnectionInput,
  ): Promise<any> {
    const envVar = (field: string) =>
      `{{ env_var("db-${field}-${conn.name}") }}`;
    const envVarInt = (field: string) =>
      `{{ env_var("db-${field}-${conn.name}") | int }}`;
    switch (conn.type) {
      case 'postgres':
        return {
          type: 'postgres',
          host: envVar('host'),
          port: envVarInt('port'),
          user: envVar('user'),
          password: envVar('password'),
          dbname: envVar('dbname'),
          schema: envVar('schema'),
          threads: 4,
          ...(conn.ssl && { sslmode: 'require' }),
        };
      case 'snowflake':
        if (this.getSnowflakeAuthMethod(conn) === 'web_browser') {
          return {
            type: 'snowflake',
            account: envVar('account'),
            user: envVar('user'),
            authenticator: 'externalbrowser',
            ...(conn.role && { role: envVar('role') }),
            warehouse: envVar('warehouse'),
            database: envVar('dbname'),
            schema: envVar('schema'),
            threads: 4,
          };
        }
        return {
          type: 'snowflake',
          account: envVar('account'),
          user: envVar('user'),
          password: envVar('password'),
          ...(conn.role && { role: envVar('role') }),
          warehouse: envVar('warehouse'),
          database: envVar('dbname'),
          schema: envVar('schema'),
          threads: 4,
        };
      case 'redshift':
        const redshiftProfile: any = {
          type: 'redshift',
          host: envVar('host'),
          port: envVarInt('port'),
          user: envVar('user'),
          password: envVar('password'),
          dbname: envVar('dbname'),
          schema: envVar('schema'),
          threads: 4,
        };

        // Add SSL configuration if enabled
        if (conn.ssl) {
          redshiftProfile.sslmode = 'require';
          if (conn.sslrootcert) {
            redshiftProfile.sslrootcert = conn.sslrootcert;
          }
        }

        return redshiftProfile;
      case 'bigquery':
        const profile: any = {
          type: 'bigquery',
          method: conn.method,
          project: envVar('project'),
          dataset: envVar('dataset'),
          threads: 4,
          priority: conn.priority || 'interactive',
          keyfile: envVar('bigquery'),
        };

        return profile;

      case 'databricks':
        return {
          type: 'databricks',
          host: envVar('host'),
          http_path: envVar('httppath'),
          token: envVar('token'),
          catalog: envVar('catalog'),
          schema: envVar('schema'),
          threads: 4,
        };
      case 'duckdb':
        return {
          type: 'duckdb',
          path: conn.database_path,
          schema: conn.schema,
          threads: 4,
        };
      case 'ducklake': {
        // For ducklake, we need to generate a DuckDB profile with ducklake extension
        const instance = await DuckLakeService.getInstance(conn.instanceId);

        const credentials = await DuckLakeInstanceStore.retrieveCredentials(
          instance.id,
          instance.catalog as any,
          instance.storage as any,
        );

        let metadataPath = '';
        if (
          instance.catalog.type === 'duckdb' &&
          instance.catalog.duckdb?.metadataPath
        ) {
          metadataPath = instance.catalog.duckdb.metadataPath;
        } else if (
          instance.catalog.type === 'sqlite' &&
          instance.catalog.sqlite?.metadataPath
        ) {
          metadataPath = instance.catalog.sqlite.metadataPath;
        }

        const duckLakeProfile: any = {
          type: 'duckdb',
          threads: 4,
          extensions: ['httpfs', 'ducklake'],
          attach: [
            {
              path: `ducklake:${metadataPath}`,
              alias: 'dl',
              options: {
                data_path: instance.dataPath,
              },
            },
          ],
          database: 'dl',
        };

        // Add S3 settings if storage is S3 - use env vars for security
        if (credentials.storage?.type === 's3' && credentials.storage.s3) {
          duckLakeProfile.settings = {
            s3_region: `{{ env_var("db-s3-region-${conn.name}") }}`,
            s3_access_key_id: `{{ env_var("db-s3-access-key-${conn.name}") }}`,
            s3_secret_access_key: `{{ env_var("db-s3-secret-key-${conn.name}") }}`,
          };
        }

        return duckLakeProfile;
      }
      case 'kinetica':
        // Map to a dbt profile. NOTE: dbt-kinetica adapter does not exist natively.
        // This output assumes users might use dbt-trino or have a custom adapter.
        // We output a generic 'kinetica' type profile for now.
        return {
          type: 'kinetica',
          host: envVar('host'),
          port: envVarInt('port'),
          user: envVar('user'),
          password: envVar('password'),
          database: envVar('dbname'),
          schema: envVar('schema'),
          threads: 4,
          ...(conn.timeout && { timeout: conn.timeout }),
          ...(conn.useSSL && { ssl: conn.useSSL }),
        };
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  /**
   * Parse profiles.yml and main.conf files from a project and extract connection information
   */
  static async parseProjectConnectionFiles(projectPath: string): Promise<{
    dbtConnection?: DBTConnection;
    rosettaConnection?: RosettaConnection;
    connectionInput?: ConnectionInput;
  }> {
    const result: {
      dbtConnection?: DBTConnection;
      rosettaConnection?: RosettaConnection;
      connectionInput?: ConnectionInput;
    } = {};

    try {
      // Parse profiles.yml
      const profilesPath = path.join(projectPath, 'profiles.yml');
      if (fs.existsSync(profilesPath)) {
        const dbtConnection = await this.parseProfilesYml(profilesPath);
        if (dbtConnection) {
          result.dbtConnection = dbtConnection;
          result.connectionInput =
            this.mapDBTConnectionToConnectionInput(dbtConnection) ?? undefined;
        }
      }

      const mainConfPath = path.join(projectPath, 'rosetta', 'main.conf');
      if (fs.existsSync(mainConfPath)) {
        const rosettaConnection = await this.parseMainConf(mainConfPath);
        if (rosettaConnection) {
          result.rosettaConnection = rosettaConnection;
        }
      }
    } catch {
      /* empty */
    }

    return result;
  }

  /**
   * Parse profiles.yml file and extract DBT connection information
   */
  private static async parseProfilesYml(
    profilesPath: string,
  ): Promise<DBTConnection | null> {
    try {
      const profilesContent = await fs.promises.readFile(profilesPath, 'utf8');
      const profilesData = yaml.load(profilesContent) as any;

      // Find the first profile (excluding 'config')
      const profileNames = Object.keys(profilesData).filter(
        (key) => key !== 'config',
      );
      if (profileNames.length === 0) return null;

      const profile = profilesData[profileNames[0]];
      const devOutput = profile?.outputs?.dev;

      if (!devOutput || !devOutput.type) return null;

      // Map different DBT connection types
      switch (devOutput.type) {
        case 'postgres':
          return {
            type: 'postgres',
            host: devOutput.host,
            port: devOutput.port || 5432,
            username: devOutput.user,
            password: devOutput.password,
            database: devOutput.dbname,
            schema: devOutput.schema,
          };

        case 'snowflake':
          return {
            type: 'snowflake',
            account: devOutput.account,
            username: devOutput.user,
            password: devOutput.password || '',
            database: devOutput.database,
            schema: devOutput.schema,
            warehouse: devOutput.warehouse,
            role: devOutput.role,
            authMethod:
              devOutput.authenticator === 'externalbrowser'
                ? 'web_browser'
                : 'password',
          };

        case 'bigquery':
          return {
            type: 'bigquery',
            method: devOutput.method || 'service-account',
            project: devOutput.project,
            database: devOutput.project,
            schema: devOutput.dataset,
            keyfile: devOutput.keyfile,
            location: devOutput.location,
            priority: devOutput.priority,
            username: '',
            password: '',
          };

        case 'redshift':
          return {
            type: 'redshift',
            host: devOutput.host,
            port: devOutput.port || 5439,
            username: devOutput.user,
            password: devOutput.password,
            database: devOutput.dbname,
            schema: devOutput.schema,
            ssl: devOutput.sslmode === 'require',
            sslrootcert: devOutput.sslrootcert,
          };

        case 'databricks':
          return {
            type: 'databricks',
            host: devOutput.host,
            port: devOutput.port || 443,
            http_path: devOutput.http_path,
            token: devOutput.token,
            database: devOutput.catalog,
            schema: devOutput.schema,
          };

        case 'duckdb':
          // Convert relative path to absolute path relative to the project directory
          const projectDir = path.dirname(profilesPath);
          const absolutePath = path.isAbsolute(devOutput.path)
            ? devOutput.path
            : path.resolve(projectDir, devOutput.path);

          return {
            type: 'duckdb',
            path: absolutePath,
            database: absolutePath,
            schema: devOutput.schema || 'main',
          };

        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Maps a DBTConnection to a ConnectionInput
   * @param dbtConnection - The DBT connection configuration
   * @param connectionName - Name for the connection (since DBT connections don't have names)
   * @returns ConnectionInput or null if mapping fails
   */
  private static mapDBTConnectionToConnectionInput(
    dbtConnection: DBTConnection,
    connectionName: string = 'DBT Connection',
  ): ConnectionInput | null {
    try {
      switch (dbtConnection.type) {
        case 'postgres':
          return {
            type: 'postgres',
            name: connectionName,
            host: dbtConnection.host,
            port: dbtConnection.port,
            username: dbtConnection.username,
            password: dbtConnection.password,
            database: dbtConnection.database,
            schema: dbtConnection.schema,
            keepalives_idle: dbtConnection.keepalives_idle,
          };

        case 'snowflake':
          return {
            type: 'snowflake',
            name: connectionName,
            account: dbtConnection.account,
            warehouse: dbtConnection.warehouse,
            username: dbtConnection.username,
            password: dbtConnection.password || '',
            database: dbtConnection.database,
            schema: dbtConnection.schema,
            role: dbtConnection.role,
            client_session_keep_alive: dbtConnection.client_session_keep_alive,
            authMethod:
              dbtConnection.authenticator === 'externalbrowser' ||
              dbtConnection.authMethod === 'web_browser'
                ? 'web_browser'
                : 'password',
          };

        case 'bigquery':
          return {
            type: 'bigquery',
            name: connectionName,
            project: dbtConnection.project,
            dataset: dbtConnection.database, // In DBT, dataset is stored in database field
            method: dbtConnection.method,
            keyfile: dbtConnection.keyfile || '',
            location: dbtConnection.location,
            priority: dbtConnection.priority,
            // Required by ConnectionBase but not used in BigQuery
            host: '',
            port: 443,
            database: dbtConnection.project, // Set to project ID
            schema: dbtConnection.schema,
            username: dbtConnection.project, // Set to project ID
            password: '', // Empty for BigQuery
          };

        case 'redshift':
          return {
            type: 'redshift',
            name: connectionName,
            host: dbtConnection.host,
            port: dbtConnection.port,
            username: dbtConnection.username,
            password: dbtConnection.password,
            database: dbtConnection.database,
            schema: dbtConnection.schema,
            keepalives_idle: dbtConnection.keepalives_idle,
            ssl: dbtConnection.ssl,
            sslrootcert: dbtConnection.sslrootcert,
          };

        case 'databricks':
          return {
            type: 'databricks',
            name: connectionName,
            host: dbtConnection.host,
            port: dbtConnection.port,
            httpPath: dbtConnection.http_path, // Note: property name differs between types
            token: dbtConnection.token,
            database: dbtConnection.catalog || dbtConnection.database,
            schema: dbtConnection.schema,
            keepalives_idle: dbtConnection.keepalives_idle,
          };

        case 'duckdb':
          return {
            type: 'duckdb',
            name: connectionName,
            database_path: dbtConnection.path,
            short_database_path:
              dbtConnection.path.split('/').pop() || dbtConnection.path,
            database: dbtConnection.database,
            schema: dbtConnection.schema,
          };

        default:
          return null;
      }
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse main.conf file and extract Rosetta connection information
   */
  private static async parseMainConf(
    mainConfPath: string,
  ): Promise<RosettaConnection | null> {
    try {
      const mainConfContent = await fs.promises.readFile(mainConfPath, 'utf8');
      const mainConfData = yaml.load(mainConfContent) as any;

      const connections = mainConfData?.connections;
      if (
        !connections ||
        !Array.isArray(connections) ||
        connections.length === 0
      ) {
        return null;
      }

      // Return the first connection
      const connection = connections[0];
      return {
        name: connection.name,
        dbType: connection.dbType,
        databaseName: connection.databaseName,
        schemaName: connection.schemaName,
        url: connection.url,
        userName: connection.userName,
        password: connection.password,
      };
    } catch (error) {
      return null;
    }
  }

  static async setConnectionEnvVariable(
    key: string,
    value: string,
  ): Promise<void> {
    process.env[key] = value;
  }

  /**
   * Validate connection name for uniqueness and reserved names
   */
  private static validateConnectionName(
    name: string,
    existingConnections: ConnectionModel[],
    excludeId?: string,
    allowReservedNames?: boolean,
  ): { isValid: boolean; message?: string } {
    // Check for empty name
    if (!name.trim()) {
      return {
        isValid: false,
        message: 'Connection name cannot be empty',
      };
    }

    // Check for reserved names (case-insensitive) - skip if allowed
    if (!allowReservedNames && name.toLowerCase().trim() === 'dbt connection') {
      return {
        isValid: false,
        message:
          'Connection name "DBT Connection" is reserved for the getting started template',
      };
    }

    // Check for uniqueness (case-insensitive)
    const duplicateExists = existingConnections.some(
      (conn) =>
        conn.connection.name.toLowerCase().trim() ===
          name.toLowerCase().trim() && conn.id !== excludeId,
    );

    if (duplicateExists) {
      return {
        isValid: false,
        message: 'A connection with this name already exists',
      };
    }

    return { isValid: true };
  }

  static async loadCloudConnections(): Promise<CloudConnection[]> {
    const db = await loadDatabaseFile();
    return db.sources ?? [];
  }

  static async saveCloudConnection(connection: CloudConnection): Promise<void> {
    const db = await loadDatabaseFile();
    const sources = db.sources ?? [];

    const existingIndex = sources.findIndex((c) => c.id === connection.id);

    if (existingIndex >= 0) {
      sources[existingIndex] = connection;
    } else {
      sources.push(connection);
    }

    await updateDatabase<'sources'>('sources', sources);
  }

  static async deleteCloudConnection(id: string): Promise<void> {
    const db = await loadDatabaseFile();
    const sources = db.sources ?? [];

    const connectionToDelete = sources.find((c) => c.id === id);
    if (connectionToDelete) {
      // Clean up cloud connection-specific credentials from secure storage
      try {
        await SecureStorageService.cleanupConnectionCredentials(
          connectionToDelete.id,
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error(
          `Failed to cleanup credentials for cloud connection ${connectionToDelete.name}:`,
          error,
        );
      }
    }

    const filteredSources = sources.filter((c) => c.id !== id);

    await updateDatabase<'sources'>('sources', filteredSources);
  }

  static async getCloudConnectionById(
    id: string,
  ): Promise<CloudConnection | null> {
    try {
      const connections = await this.loadCloudConnections();
      return connections.find((c) => c.id === id) || null;
    } catch (error) {
      return null;
    }
  }

  static async loadRecentItems(): Promise<RecentItem[]> {
    try {
      const db = await loadDatabaseFile();
      const items = db.recentItems ?? [];
      return items.sort(
        (a, b) =>
          new Date(b.accessedAt).getTime() - new Date(a.accessedAt).getTime(),
      );
    } catch (error) {
      return [];
    }
  }

  static async addRecentItem(
    item: Omit<RecentItem, 'accessedAt'>,
  ): Promise<void> {
    const db = await loadDatabaseFile();
    const items = db.recentItems ?? [];

    const existingIndex = items.findIndex((i) => i.id === item.id);

    if (existingIndex >= 0) {
      items.splice(existingIndex, 1);
    }

    items.unshift({ ...item, accessedAt: new Date() });

    const recentItems = items.slice(0, 50);
    await updateDatabase<'recentItems'>('recentItems', recentItems);
  }

  static async removeRecentItem(id: string): Promise<void> {
    const db = await loadDatabaseFile();
    const items = db.recentItems ?? [];

    const filteredItems = items.filter((i) => i.id !== id);

    await updateDatabase<'recentItems'>('recentItems', filteredItems);
  }

  static async clearRecentItems(): Promise<void> {
    await updateDatabase<'recentItems'>('recentItems', []);
  }

  /**
   * Extract schema directly from a connection (not project-based)
   */
  static async extractSchemaFromConnection(
    connectionId: string,
  ): Promise<{ tables: any[] }> {
    const conn = await this.getConnectionById(connectionId);

    if (!conn) {
      throw new Error(`Connection with id ${connectionId} not found`);
    }

    const { connection } = conn;

    if (!connection.type) {
      throw new Error(
        'Database connection type is not defined. Please reconfigure your connection.',
      );
    }

    // Get credentials from secure storage
    const storeUser = await SecureStorageService.getCredential(
      `db-user-${connection.name}`,
    );
    const storePassword = await SecureStorageService.getCredential(
      `db-password-${connection.name}`,
    );

    if (storeUser) {
      (connection as { username: string }).username = storeUser;
    }
    if (storePassword) {
      (connection as { password: string }).password = storePassword;
    }

    const storeToken = await SecureStorageService.getCredential(
      `db-token-${connection.name}`,
    );
    if (storeToken) {
      (connection as { token: string }).token = storeToken;
    }

    const bigqueryKey = await SecureStorageService.getCredential(
      `db-bigquery-${connection.name}`,
    );
    if (bigqueryKey) {
      (connection as { keyfile: string }).keyfile = bigqueryKey;
    }

    // Import extractors dynamically to avoid circular dependency
    const {
      PGSchemaExtractor,
      SnowflakeExtractor,
      DatabricksExtractor,
      BigQueryExtractor,
      DuckDBExtractor,
      RedshiftExtractor,
      KineticaExtractor,
    } = await import('../extractor');

    switch (connection.type) {
      case 'postgres': {
        const pgConn = connection as PostgresConnection;
        const extractor = new PGSchemaExtractor({
          user: pgConn.username,
          host: pgConn.host,
          database: pgConn.database,
          password: pgConn.password,
          port: pgConn.port,
          ssl: pgConn.ssl,
          sslRejectUnauthorized: pgConn.sslRejectUnauthorized,
        });
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      case 'redshift': {
        const rsConn = connection as RedshiftConnection;
        const extractor = new RedshiftExtractor({
          user: rsConn.username,
          host: rsConn.host,
          database: rsConn.database,
          password: rsConn.password,
          port: rsConn.port,
          ssl: rsConn.ssl ?? true,
          sslrootcert: rsConn.sslrootcert,
        });
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      case 'snowflake': {
        const sfConn = connection as SnowflakeConnection;
        const extractor = new SnowflakeExtractor({
          account: sfConn.account.split('.')[0],
          username: sfConn.username,
          password: sfConn.password,
          warehouse: sfConn.warehouse,
          database: sfConn.database,
          schema: sfConn.schema,
          role: sfConn.role,
          authMethod: this.getSnowflakeAuthMethod(sfConn),
        });
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      case 'databricks': {
        const dbConn = connection as DatabricksConnection;
        const extractor = new DatabricksExtractor({
          token: dbConn.token,
          host: dbConn.host,
          path: dbConn.httpPath,
          catalog: dbConn.database || 'default',
          schema: dbConn.schema,
        });
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      case 'bigquery': {
        const bqConn = connection as BigQueryConnection;
        const config: any = {
          projectId: bqConn.project,
        };
        let keyfileValue = bqConn.keyfile;
        if (
          typeof keyfileValue === 'string' &&
          keyfileValue.startsWith('db-bigquery-')
        ) {
          const stored = await SecureStorageService.getCredential(keyfileValue);
          if (!stored) {
            throw new Error(
              'BigQuery service account key not found in secure storage',
            );
          }
          keyfileValue = stored;
        }
        try {
          config.credentials = JSON.parse(keyfileValue);
        } catch (err) {
          throw new Error('Invalid service account key JSON');
        }
        if (bqConn.location) {
          config.location = bqConn.location;
        }
        const extractor = new BigQueryExtractor(config);
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      case 'duckdb': {
        const duckConn = connection as DuckDBConnection;
        const extractor = new DuckDBExtractor({
          database_path: duckConn.database_path,
          schema: duckConn.schema,
        });
        const schema = await extractor.extractSchema();
        return schema;
      }
      case 'ducklake': {
        return { tables: [] };
      }
      case 'kinetica': {
        const kinConn = connection as KineticaConnection;
        const extractor = new KineticaExtractor({
          host: kinConn.host,
          port: kinConn.port,
          username: kinConn.username,
          password: kinConn.password,
          useSSL: kinConn.useSSL,
          timeout: kinConn.timeout,
          schema: kinConn.schema,
        });
        try {
          await extractor.connect();
          const schema = await extractor.extractSchema();
          return schema;
        } finally {
          await extractor.disconnect();
        }
      }
      default:
        throw new Error(
          `Unsupported connection type: "${(connection as any).type}"`,
        );
    }
  }

  /**
   * Save a query for a specific connection (connection-based, not project-based)
   */
  static async updateConnectionQuery(
    connectionId: string,
    query: string,
  ): Promise<void> {
    const db = await loadDatabaseFile();
    const queries = db.queries ?? {};
    // Use a connection-specific key prefix to distinguish from project queries
    queries[`connection:${connectionId}`] = query;
    await updateDatabase('queries', queries);
  }

  /**
   * Get the saved query for a specific connection
   */
  static async getConnectionQuery(connectionId: string): Promise<string> {
    const db = await loadDatabaseFile();
    return db.queries?.[`connection:${connectionId}`] ?? '';
  }

  /**
   * Execute a query directly using a connection (not project-based)
   */
  static async executeQueryForConnection({
    connectionId,
    query,
    queryId,
  }: {
    connectionId: string;
    query: string;
    queryId?: string;
  }): Promise<QueryResponseType> {
    const conn = await this.getConnectionById(connectionId);

    if (!conn) {
      throw new Error(`Connection with id ${connectionId} not found`);
    }

    const { connection } = conn;

    // Get credentials from secure storage
    const storeUser = await SecureStorageService.getCredential(
      `db-user-${connection.name}`,
    );
    const storePassword = await SecureStorageService.getCredential(
      `db-password-${connection.name}`,
    );

    if (storeUser) {
      (connection as any).username = storeUser;
    }
    if (storePassword) {
      (connection as any).password = storePassword;
    }

    const storeToken = await SecureStorageService.getCredential(
      `db-token-${connection.name}`,
    );
    if (storeToken) {
      (connection as any).token = storeToken;
    }

    const bigQueryKey = await SecureStorageService.getCredential(
      `db-bigquery-${connection.name}`,
    );
    if (bigQueryKey) {
      (connection as any).keyfile = bigQueryKey;
    }

    // Use a dummy project name for credential lookup (use connection name)
    return this.executeSelectStatement({
      connection,
      query,
      projectName: connection.name,
      queryId,
    });
  }
}
