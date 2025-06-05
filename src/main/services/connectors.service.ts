import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import {
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
  testPostgresConnection,
  testSnowflakeConnection,
  testDatabricksConnection,
  executeDatabricksQuery,
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
    const jdbcUrl = this.generateJdbcUrl(connection);

    const updatedProject: Project = {
      ...projects[projectIndex],
      rosettaConnection: {
        name: connection.name || projects[projectIndex].name,
        dbType: connection.type,
        databaseName: connection.database,
        schemaName: connection.schema,
        url: jdbcUrl,
        // For Databricks, don't include userName/password since auth is in URL
        // For other connections, include userName and password
        ...(connection.type !== 'databricks' && {
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
    await fs.promises.writeFile(
      profilesPath,
      this.generateProfilesYml(connection),
      'utf8',
    );
    const mainConfPath = path.join(updatedProject.path, 'rosetta', 'main.conf');
    const rosettaYaml = await this.generateRosettaYml(
      connection,
      updatedProject.name,
    );
    await fs.promises.writeFile(mainConfPath, rosettaYaml, 'utf8');
    return updatedProject;
  }

  /**
   * Test a connection configuration
   */
  static async testConnection(connection: ConnectionInput): Promise<boolean> {
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
      case 'databricks':
        return testDatabricksConnection(connection);
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
      case 'databricks':
        return executeDatabricksQuery(connection, query);
      default:
        throw new Error(`Unsupported connection type: ${connection.type}`);
    }
  }

  /**
   * Generate profiles.yml content for dbt
   */
  static generateProfilesYml(connection: ConnectionInput): string {
    return this.mapToDbtProfiles(connection);
  }

  static async generateRosettaYml(
    connection: ConnectionInput,
    projectName: string,
  ): Promise<string> {
    const { openAIApiKey } = await SettingsService.loadSettings();
    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      openai_api_key:
        openAIApiKey && openAIApiKey !== '' ? openAIApiKey : undefined,
      connections: [
        {
          name: projectName,
          databaseName: connection.database,
          schemaName: connection.schema,
          dbType: connection.type,
          url: this.generateJdbcUrl(connection),
          // For Databricks, don't include separate token field since it's in the URL
          // For other connections, include userName and password
          ...(connection.type !== 'databricks' && {
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
        throw new Error('BigQuery does not use JDBC URLs');
      case 'databricks':
        // Use token-based authentication with no username (UID)
        return `jdbc:databricks://${conn.host}:443/default;transportMode=http;ssl=1;AuthMech=3;httpPath=${conn.httpPath};PWD=${conn.token}`;
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
      default:
        // Use type assertion to access the type property for error message
        throw new Error(
          `Unsupported connection type: ${(conn as ConnectionInput).type}`,
        );
    }
  }

  private static mapToDbtProfiles(conn: ConnectionInput): string {
    const profileConfig = {
      config: {
        send_anonymous_usage_stats: false,
        partial_parse: true,
      },
      [conn.name]: {
        target: 'dev',
        outputs: {
          dev: this.mapToDbtProfileOutput(conn),
        },
      },
    };

    return yaml.dump(profileConfig);
  }

  private static mapToDbtProfileOutput(conn: ConnectionInput): any {
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
        return {
          type: 'bigquery',
          method: conn.method,
          project: conn.project,
          dataset: conn.schema,
          keyfile: conn.keyfile,
          threads: 4,
        };
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
      default:
        throw new Error('Unsupported connection type!');
    }
  }
}
