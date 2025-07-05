/* eslint-disable no-case-declarations */
/* eslint-disable @typescript-eslint/no-shadow */
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
import { ProjectsService } from './index';
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
  testRedshiftConnection,
  executeRedshiftQuery,
} from '../utils/connectors';
import SecureStorageService from './secureStorage.service';

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
    let rosettaJdbcUrl = this.generateJdbcUrl(connection, currentProject.name);
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
            userName: `db-user-${currentProject.name}`,
            password: `db-password-${currentProject.name}`,
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
      currentProject.name,
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
  }: {
    connection: ConnectionInput;
    query: string;
    projectName: string;
  }): Promise<QueryResponseType> {
    const storeUser = await SecureStorageService.getCredential(
      `db-user-${projectName}`,
    );
    const storePassword = await SecureStorageService.getCredential(
      `db-password-${projectName}`,
    );

    const storeToken = await SecureStorageService.getCredential(
      `db-token-${projectName}`,
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

  static async generateRosettaYml(
    connection: ConnectionInput,
    projectName: string,
    projectPath?: string,
  ): Promise<string> {
    // const { openAIApiKey } = await SettingsService.loadSettings();

    // Generate JDBC URL and handle BigQuery service account file path
    let jdbcUrl = this.generateJdbcUrl(connection, projectName);

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
    const USER = `db-user-${projectName}`;
    const PASSWORD = `db-password-${projectName}`;
    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      // openai_api_key:
      //   openAIApiKey && openAIApiKey !== '' ? openAIApiKey : undefined,
      connections: [
        {
          name: projectName,
          databaseName:
            connection.type === 'duckdb'
              ? connection.short_database_path
              : connection.database,
          schemaName: connection.schema,
          dbType: connection.type,
          url: jdbcUrl,
          // For Databricks and DuckDB, don't include userName/password since auth is different
          ...(connection.type !== 'databricks' &&
            connection.type !== 'duckdb' && {
              userName: `\${${USER}}`,
              password: `\${${PASSWORD}}`,
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

  static generateJdbcUrl(conn: ConnectionInput, projectName: string): string {
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
      case 'bigquery':
        // eslint-disable-next-line no-case-declarations
        const host = 'https://www.googleapis.com';
        const path = 'bigquery/v2';
        const port = 443;
        const projectId = conn.project;
        // eslint-disable-next-line no-case-declarations
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
        const TOKEN = `db-token-${projectName}`;
        return `jdbc:databricks://${conn.host}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${conn.httpPath};PWD=\${${TOKEN}}`;
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
          ...(conn.keyfile && { keyfile: conn.keyfile }),
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
    conn: ConnectionInput,
    projectPath?: string,
    projectName?: string,
  ): Promise<string> {
    const profileConfig = {
      config: {
        send_anonymous_usage_stats: false,
        partial_parse: true,
      },
      [conn.name]: {
        target: 'dev',
        outputs: {
          dev: await this.mapToDbtProfileOutput(conn, projectPath, projectName),
        },
      },
    };

    return yaml.dump(profileConfig);
  }

  static generateProfilesYml(
    connection: ConnectionInput,
    projectPath?: string,
    projectName?: string,
  ): Promise<string> {
    return this.mapToDbtProfiles(connection, projectPath, projectName);
  }

  private static async mapToDbtProfileOutput(
    conn: ConnectionInput,
    projectPath?: string,
    projectName?: string,
  ): Promise<any> {
    const dbUserName = `{{ env_var("db-user-${projectName}") }}`;
    const dbPassword = `{{ env_var("db-password-${projectName}") }}`;
    const dbToken = `{{ env_var("db-token-${projectName}") }}`;
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
          token: dbToken, // Use token directly
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
        `${`${gitignoreContent}\n.secrets/\n`.trim()}\n`,
        'utf8',
      );
    }

    return filePath;
  }

  /**
   * Parse profiles.yml and main.conf files from a project and extract connection information
   */
  static async parseProjectConnectionFiles(projectPath: string): Promise<{
    dbtConnection?: DBTConnection;
    rosettaConnection?: RosettaConnection;
  }> {
    const result: {
      dbtConnection?: DBTConnection;
      rosettaConnection?: RosettaConnection;
    } = {};

    try {
      // Parse profiles.yml
      const profilesPath = path.join(projectPath, 'profiles.yml');
      if (fs.existsSync(profilesPath)) {
        const dbtConnection = await this.parseProfilesYml(profilesPath);
        if (dbtConnection) {
          result.dbtConnection = dbtConnection;
        }
      }

      // Parse main.conf (Rosetta configuration)
      const mainConfPath = path.join(projectPath, 'rosetta', 'main.conf');
      if (fs.existsSync(mainConfPath)) {
        const rosettaConnection = await this.parseMainConf(mainConfPath);
        if (rosettaConnection) {
          result.rosettaConnection = rosettaConnection;
        }
      }
    } catch (error) {
      console.error('Error parsing project connection files:', error);
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
            username: '', // BigQuery doesn't use traditional username/password
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
          console.warn(`Unsupported DBT connection type: ${devOutput.type}`);
          return null;
      }
    } catch (error) {
      console.error('Error parsing profiles.yml:', error);
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
      console.error('Error parsing main.conf:', error);
      return null;
    }
  }

  static async setConnectionEnvVariable(
    key: string,
    value: string,
  ): Promise<void> {
    process.env[key] = value;
  }
}
