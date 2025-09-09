/* eslint-disable no-case-declarations, @typescript-eslint/no-shadow */
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidV4 } from 'uuid';
import {
  BigQueryTestResponse,
  ConnectionInput,
  ConnectionModel,
  DBTConnection,
  ExecuteStatementType,
  Project,
  QueryResponseType,
  RosettaConnection,
} from '../../types/backend';
import { loadDatabaseFile, updateDatabase } from '../utils/fileHelper';
import { ProjectsService } from './index';
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
} from '../utils/connectors';
import SecureStorageService from './secureStorage.service';
import { CloudConnection, RecentItem } from '../../types/frontend';

export default class ConnectorsService {
  static async loadConnections(): Promise<ConnectionModel[]> {
    const db = await loadDatabaseFile();
    return db.connections ?? [];
  }

  static async getConnectionById(
    connectionId: string,
  ): Promise<ConnectionModel | undefined> {
    const connections = await this.loadConnections();
    return connections.find((connection) => connection.id === connectionId);
  }

  /**
   * Find a connection by name (case-insensitive)
   */
  static async findConnectionByName(
    name: string,
  ): Promise<ConnectionModel | undefined> {
    const connections = await this.loadConnections();
    return connections.find(
      (conn) =>
        conn.connection.name.toLowerCase().trim() === name.toLowerCase().trim(),
    );
  }

  /**
   * Save a new connection, allowing reserved names for Getting Started template
   */
  static async saveNewConnectionForTemplate(
    connection: ConnectionInput,
    allowReservedNames: boolean = false,
  ): Promise<string> {
    const connections = await this.loadConnections();

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
    const connections = await this.loadConnections();

    // Validate connection name
    const nameValidation = this.validateConnectionName(
      connection.name,
      connections,
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
    const connections = await this.loadConnections();
    const connection = connections.find((c) => c.id === project.connectionId);

    if (!connection) {
      throw new Error('Missing connection');
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

    const mainConfPath = path.join(project.path, 'rosetta', 'main.conf');
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

    const connections = await this.loadConnections();
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
          // Reuse existing connection for the starter project
          connectionId = existingConnection.id;
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

    const connections = await this.loadConnections();

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
  }

  /**
   * Delete a connection if it's not being used by any projects
   */
  static async deleteConnection(connectionId: string): Promise<void> {
    // Check if the connection exists
    const connections = await this.loadConnections();
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
        connectionToDelete.connection.name,
      );
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to cleanup credentials for connection ${connectionToDelete.connection.name}:`,
        error,
      );
    }

    // Remove the connection from the database
    const updatedConnections = connections.filter(
      (connection) => connection.id !== connectionId,
    );

    await updateDatabase<'connections'>('connections', updatedConnections);
  }

  /**
   * Test a connection configuration
   */
  static async testConnection(
    connection: ConnectionInput,
  ): Promise<boolean | BigQueryTestResponse> {
    await this.validateConnection(connection);
    switch (connection.type) {
      case 'postgres':
        return testPostgresConnection(connection);
      case 'snowflake':
        try {
          return await testSnowflakeConnection(connection);
        } catch {
          return false;
        }
      case 'bigquery':
        return testBigQueryConnection(connection);
      case 'databricks':
        return testDatabricksConnection(connection);
      case 'duckdb':
        return testDuckDBConnection(connection);
      case 'redshift':
        return testRedshiftConnection(connection);
      default:
        throw new Error(
          `Unsupported connection type: ${(connection as any).type}`,
        );
    }
  }

  /**
   * Run a select statement and expect the results and fields
   */
  static async executeSelectStatement({
    connection,
    query,
    projectName,
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

    switch (connection.type) {
      case 'postgres':
        return executePostgresQuery(connection, query);
      case 'snowflake':
        return executeSnowflakeQuery(connection, query);
      case 'bigquery':
        return executeBigQueryQuery(connection, query);
      case 'databricks':
        return executeDatabricksQuery(connection, query);
      case 'duckdb':
        return executeDuckDBQuery(connection, query);
      case 'redshift':
        return executeRedshiftQuery(connection, query);
      default:
        // Use the literal type instead of accessing the property to avoid TypeScript error
        throw new Error(
          `Unsupported connection type: ${(connection as any).type}`,
        );
    }
  }

  static extractDbNameFromPath = (url: string) => {
    return path.parse(url).name;
  };

  static async generateRosettaYml(
    connection: ConnectionInput,
    projectName: string,
  ): Promise<string> {
    const jdbcUrl = await this.generateJdbcUrl(connection, projectName);
    // Removed BigQuery keyfile fetch/validation here
    // USER and PASSWORD only declared here
    const USER = `db-user-${connection.name}`;
    const PASSWORD = `db-password-${connection.name}`;
    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      openai_api_key: `\${openai-api-key}`,
      connections: [
        {
          name: projectName,
          databaseName:
            connection.type === 'duckdb'
              ? this.extractDbNameFromPath(connection.short_database_path)
              : connection.database,
          schemaName: connection.schema,
          dbType: connection.type,
          url: jdbcUrl,
          // Only add userName/password for non-BigQuery, non-Databricks, non-DuckDB
          ...(connection.type !== 'databricks' &&
            connection.type !== 'duckdb' &&
            connection.type !== 'bigquery' && {
              userName: `\${${USER}}`,
              password: `\${${PASSWORD}}`,
            }),
        },
      ],
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
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  static async generateJdbcUrl(
    conn: ConnectionInput,
    projectName: string,
  ): Promise<string> {
    switch (conn.type) {
      case 'postgres':
        return `jdbc:postgresql://${conn.host}:${conn.port}/${conn.database}?currentSchema=${conn.schema}`;
      case 'snowflake':
        return `jdbc:snowflake://${conn.account}.snowflakecomputing.com/?warehouse=${conn.warehouse}&db=${conn.database}&schema=${conn.schema}`;
      case 'redshift': {
        let redshiftUrl = `jdbc:redshift://${conn.host}:${conn.port}/${conn.database}?currentSchema=${conn.schema}`;

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
        // For project creation/update, do NOT require or parse keyfile
        // Just return a minimal JDBC URL
        const projectId = conn.project;
        return `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${projectId};`;
      }
      case 'databricks':
        // Use token-based authentication with no username (UID)
        const TOKEN = `db-token-${projectName}`;
        return `jdbc:databricks://${conn.host}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${conn.httpPath};PWD=\${${TOKEN}}`;
      case 'duckdb':
        // DuckDB JDBC URL format
        return `jdbc:duckdb:${conn.database_path}`;
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  private static async mapToRosettaConnection(
    connection: ConnectionInput,
    project: Project,
  ): Promise<RosettaConnection> {
    const rosettaJdbcUrl = await this.generateJdbcUrl(connection, project.name);
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
      databaseName:
        connection.type === 'duckdb'
          ? connection.database_path
          : connection.database,
      schemaName: connection.schema,
      url: rosettaJdbcUrl,
      ...(connection.type !== 'databricks' &&
        connection.type !== 'duckdb' &&
        connection.type !== 'bigquery' &&
        'username' in connection &&
        'password' in connection && {
          userName: `db-user-${connection.name}`,
          password: `db-password-${connection.name}`,
        }),
    };
  }

  private static mapToDbtConnection(conn: ConnectionInput): DBTConnection {
    switch (conn.type) {
      case 'snowflake':
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
      config: {
        send_anonymous_usage_stats: false,
        partial_parse: true,
      },
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
    const dbUserName = `{{ env_var("db-user-${conn.name}") }}`;
    const dbPassword = `{{ env_var("db-password-${conn.name}") }}`;
    const dbToken = `{{ env_var("db-token-${conn.name}") }}`;
    const dbKeyfile = `{{ env_var("db-bigquery-${conn.name}") }}`;
    switch (conn.type) {
      case 'postgres':
        return {
          type: 'postgres',
          host: conn.host,
          port: conn.port,
          user: dbUserName,
          password: dbPassword,
          dbname: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'snowflake':
        return {
          type: 'snowflake',
          account: conn.account,
          user: dbUserName,
          password: dbPassword,
          role: conn.role || 'SYSADMIN',
          warehouse: conn.warehouse,
          database: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'redshift':
        const redshiftProfile: any = {
          type: 'redshift',
          host: conn.host,
          port: conn.port,
          user: dbUserName,
          password: dbPassword,
          dbname: conn.database,
          schema: conn.schema,
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
          project: conn.project,
          dataset: conn.schema,
          threads: 4,
          priority: conn.priority || 'interactive',
          keyfile: dbKeyfile,
        };

        return profile;

      case 'databricks':
        return {
          type: 'databricks',
          host: conn.host,
          http_path: conn.httpPath,
          token: dbToken,
          catalog: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'duckdb':
        return {
          type: 'duckdb',
          path: conn.database_path,
          schema: conn.schema,
          threads: 4,
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
            password: devOutput.password,
            database: devOutput.database,
            schema: devOutput.schema,
            warehouse: devOutput.warehouse,
            role: devOutput.role,
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
            password: dbtConnection.password,
            database: dbtConnection.database,
            schema: dbtConnection.schema,
            role: dbtConnection.role,
            client_session_keep_alive: dbtConnection.client_session_keep_alive,
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
          connectionToDelete.name,
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
      return db.recentItems ?? [];
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
      items[existingIndex] = { ...item, accessedAt: new Date() };
    } else {
      items.unshift({ ...item, accessedAt: new Date() });
    }

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
}
