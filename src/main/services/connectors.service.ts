import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import {
  BigQueryTestResponse,
  ConnectionInput,
  DBTConnection,
  Project,
  QueryResponseType,
  RosettaConnection,
} from '../../types/backend';
import { updateDatabase } from '../utils/fileHelper';
import { ProjectsService, SettingsService } from './index';
import { ConfigureConnectionBody } from '../../types/ipc';
import {
  executePostgresQuery,
  executeSnowflakeQuery,
  executeBigQueryQuery,
  testPostgresConnection,
  testSnowflakeConnection,
  testBigQueryConnection,
  testDatabricksConnection,
  executeDatabricksQuery,
  testDuckDBConnection,
  executeDuckDBQuery,
} from '../utils/connectors';

export default class ConnectorsService {
  /**
   * Configure a connection for a specific project
   */
  static async configureConnection({
    projectId,
    connection,
  }: ConfigureConnectionBody): Promise<Project> {
    const projects = await ProjectsService.loadProjects();
    const projectIndex = projects.findIndex((p) => p.id === projectId);

    if (projectIndex === -1) {
      throw new Error(`Project not found: ${projectId}`);
    }

    this.validateConnection(connection);

    const currentProject = projects[projectIndex];

    // Generate JDBC URL with proper file path handling for BigQuery service account
    let rosettaJdbcUrl = this.generateJdbcUrl(connection);
    if (
      connection.type === 'bigquery' &&
      connection.method === 'service-account' &&
      connection.keyfile
    ) {
      const keyfilePath = await this.saveServiceAccountFile(
        currentProject.path,
        connection.keyfile,
      );
      rosettaJdbcUrl = rosettaJdbcUrl.replace(
        'KEYFILE_PATH_PLACEHOLDER',
        keyfilePath,
      );
    }

    const updatedProject: Project = {
      ...currentProject,
      rosettaConnection: {
        name: connection.name || currentProject.name,
        dbType: connection.type,
        databaseName:
          connection.type === 'duckdb'
            ? connection.database_path
            : connection.database,
        schemaName: connection.schema,
        url: rosettaJdbcUrl,
        // For Databricks and DuckDB, don't include userName/password since auth is different
        ...(connection.type !== 'databricks' &&
          connection.type !== 'duckdb' &&
          'username' in connection &&
          'password' in connection && {
            userName: connection.username,
            password: connection.password,
          }),
      },
      dbtConnection: this.mapToDbtConnection(connection),
    };

    projects[projectIndex] = updatedProject;
    await ProjectsService.saveProjects(projects);
    await updateDatabase<'selectedProject'>('selectedProject', updatedProject);

    const profilesPath = path.join(updatedProject.path, 'profiles.yml');
    const profilesContent = await this.generateProfilesYml(
      connection,
      updatedProject.path,
    );
    await fs.promises.writeFile(profilesPath, profilesContent, 'utf8');

    const mainConfPath = path.join(updatedProject.path, 'rosetta', 'main.conf');
    const rosettaYaml = await this.generateRosettaYml(
      connection,
      updatedProject.name,
      updatedProject.path,
    );
    await fs.promises.writeFile(mainConfPath, rosettaYaml, 'utf8');

    return updatedProject;
  }

  /**
   * Test a connection configuration
   */
  static async testConnection(
    connection: ConnectionInput,
  ): Promise<boolean | BigQueryTestResponse> {
    this.validateConnection(connection);
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
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  }

  /**
   * Run a select statement and expect the results and fields
   */
  static async executeSelectStatement({
    connection,
    query,
  }: {
    connection: ConnectionInput;
    query: string;
  }): Promise<QueryResponseType> {
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
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  }

  static async generateRosettaYml(
    connection: ConnectionInput,
    projectName: string,
    projectPath?: string,
  ): Promise<string> {
    const { openAIApiKey } = await SettingsService.loadSettings();

    // Generate JDBC URL and handle BigQuery service account file path
    let jdbcUrl = this.generateJdbcUrl(connection);

    // For BigQuery service account, replace placeholder with actual file path
    if (
      connection.type === 'bigquery' &&
      connection.method === 'service-account' &&
      connection.keyfile &&
      projectPath
    ) {
      const keyfilePath = await this.saveServiceAccountFile(
        projectPath,
        connection.keyfile,
      );
      jdbcUrl = jdbcUrl.replace('KEYFILE_PATH_PLACEHOLDER', keyfilePath);
    }

    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      openai_api_key:
        openAIApiKey && openAIApiKey !== '' ? openAIApiKey : undefined,
      connections: [
        {
          name: projectName,
          databaseName:
            connection.type === 'duckdb'
              ? connection.database_path
              : connection.database,
          schemaName: connection.schema,
          dbType: connection.type,
          url: jdbcUrl,
          // For Databricks and DuckDB, don't include userName/password since auth is different
          ...(connection.type !== 'databricks' &&
            connection.type !== 'duckdb' && {
              userName: connection.username,
              password: connection.password,
            }),
        },
      ],
    };
    return yaml.dump(yamlData);
  }

  static validateConnection(conn: ConnectionInput): void {
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
        if (conn.method === 'service-account' && !conn.keyfile) {
          throw new Error('Service account keyfile is required');
        }
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

  static generateJdbcUrl(conn: ConnectionInput): string {
    switch (conn.type) {
      case 'postgres':
        return `jdbc:postgresql://${conn.host}:${conn.port}/${conn.database}?user=${conn.username}&password=${conn.password}&currentSchema=${conn.schema}`;
      case 'snowflake':
        return `jdbc:snowflake://${conn.account}.snowflakecomputing.com/?user=${conn.username}&password=${conn.password}&warehouse=${conn.warehouse}&db=${conn.database}&schema=${conn.schema}`;
      case 'redshift':
        return `jdbc:redshift://${conn.host}:${conn.port}/${conn.database}?user=${conn.username}&password=${conn.password}`;
      case 'bigquery':
        const host = 'https://www.googleapis.com';
        const path = 'bigquery/v2';
        const port = 443;
        const projectId = conn.project;
        const baseUrl = `jdbc:bigquery://${host}/${path}:${port}`;

        if (conn.method === 'service-account' && conn.keyfile) {
          try {
            const credentials = JSON.parse(conn.keyfile);
            // Use Simba BigQuery JDBC driver format for service account authentication
            return `${baseUrl};ProjectId=${projectId};OAuthType=0;OAuthServiceAcctEmail=${credentials.client_email};OAuthPvtKeyPath=KEYFILE_PATH_PLACEHOLDER`;
          } catch (err) {
            throw new Error('Invalid service account key JSON format');
          }
        } else {
          throw new Error(
            'Only service account authentication is supported for BigQuery',
          );
        }
      case 'databricks':
        // Use token-based authentication with no username (UID)
        return `jdbc:databricks://${conn.host}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${conn.httpPath};PWD=${conn.token}`;
      case 'duckdb':
        // DuckDB JDBC URL format
        return `jdbc:duckdb:${conn.database_path}`;
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  private static mapToDbtConnection(conn: ConnectionInput): DBTConnection {
    // Handle each connection type separately to ensure type safety
    switch (conn.type) {
      case 'snowflake':
        return {
          type: 'snowflake',
          username: conn.username,
          password: conn.password,
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
          ...(conn.keyfile && { keyfile: conn.keyfile }),
          ...(conn.location && { location: conn.location }),
          ...(conn.priority && { priority: conn.priority }),
        };
      case 'postgres':
        return {
          type: 'postgres',
          username: conn.username,
          password: conn.password,
          database: conn.database,
          schema: conn.schema,
          host: conn.host,
          port: conn.port,
        };
      case 'redshift':
        return {
          type: 'redshift',
          username: conn.username,
          password: conn.password,
          database: conn.database,
          schema: conn.schema,
          host: conn.host,
          port: conn.port,
        };
      case 'databricks':
        // Special case for Databricks with token auth
        return {
          type: 'databricks',
          host: conn.host,
          port: conn.port,
          http_path: conn.httpPath,
          token: conn.token,
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
    conn: ConnectionInput,
    projectPath?: string,
  ): Promise<string> {
    const profileConfig = {
      config: {
        send_anonymous_usage_stats: false,
        partial_parse: true,
      },
      [conn.name]: {
        target: 'dev',
        outputs: {
          dev: await this.mapToDbtProfileOutput(conn, projectPath),
        },
      },
    };

    return yaml.dump(profileConfig);
  }

  static generateProfilesYml(
    connection: ConnectionInput,
    projectPath?: string,
  ): Promise<string> {
    return this.mapToDbtProfiles(connection, projectPath);
  }

  private static async mapToDbtProfileOutput(
    conn: ConnectionInput,
    projectPath?: string,
  ): Promise<any> {
    switch (conn.type) {
      case 'postgres':
        return {
          type: 'postgres',
          host: conn.host,
          port: conn.port,
          user: conn.username,
          password: conn.password,
          dbname: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'snowflake':
        return {
          type: 'snowflake',
          account: conn.account,
          user: conn.username,
          password: conn.password,
          role: conn.role || 'SYSADMIN',
          warehouse: conn.warehouse,
          database: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'redshift':
        return {
          type: 'redshift',
          host: conn.host,
          port: conn.port,
          user: conn.username,
          password: conn.password,
          dbname: conn.database,
          schema: conn.schema,
          threads: 4,
        };
      case 'bigquery':
        const profile: any = {
          type: 'bigquery',
          method: conn.method,
          project: conn.project,
          dataset: conn.schema,
          threads: 4,
          priority: conn.priority || 'interactive',
        };

        if (conn.location) {
          profile.location = conn.location;
        }

        if (conn.method === 'service-account') {
          if (!conn.keyfile) {
            throw new Error('Service account keyfile is required');
          }
          if (!projectPath) {
            throw new Error(
              'Project path is required for service account file creation',
            );
          }
          const keyfilePath = await this.saveServiceAccountFile(
            projectPath,
            conn.keyfile,
          );
          profile.keyfile = keyfilePath;
        } else {
          throw new Error(
            'Only service account authentication is supported for BigQuery',
          );
        }

        return profile;

      case 'databricks':
        return {
          type: 'databricks',
          host: conn.host,
          http_path: conn.httpPath,
          token: conn.token, // Use token directly
          catalog: conn.database, // In Databricks, database maps to catalog
          schema: conn.schema,
          threads: 4,
        };
      case 'duckdb':
        return {
          type: 'duckdb',
          path: conn.database_path, // Use the file path for DuckDB
          schema: conn.schema,
          threads: 4,
        };
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  private static async saveServiceAccountFile(
    projectPath: string,
    keyfile: string,
  ): Promise<string> {
    // Create .secrets directory if it doesn't exist
    const secretsDir = path.join(projectPath, '.secrets');
    if (!fs.existsSync(secretsDir)) {
      await fs.promises.mkdir(secretsDir, { recursive: true });
    }

    // Check if a BigQuery service account file already exists
    const existingFiles = fs
      .readdirSync(secretsDir)
      .filter(
        (file) =>
          file.startsWith('bigquery-service-account-') &&
          file.endsWith('.json'),
      );

    let filePath: string;

    if (existingFiles.length > 0) {
      // Use the first existing service account file
      filePath = path.join(secretsDir, existingFiles[0]);
      // Update the content of the existing file
      await fs.promises.writeFile(filePath, keyfile, 'utf8');
    } else {
      // Create a new service account file
      const filename = `bigquery-service-account-${Date.now()}.json`;
      filePath = path.join(secretsDir, filename);
      await fs.promises.writeFile(filePath, keyfile, 'utf8');
    }

    // Add .secrets to .gitignore if not already there
    const gitignorePath = path.join(projectPath, '.gitignore');
    const gitignoreExists = fs.existsSync(gitignorePath);
    const gitignoreContent = gitignoreExists
      ? await fs.promises.readFile(gitignorePath, 'utf8')
      : '';

    if (!gitignoreContent.includes('.secrets')) {
      await fs.promises.writeFile(
        gitignorePath,
        (gitignoreContent + '\n.secrets/\n').trim() + '\n',
        'utf8',
      );
    }

    return filePath;
  }
}
