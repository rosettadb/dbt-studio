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

    // For BigQuery OAuth, ensure we have a valid access token
    if (connection.type === 'bigquery' && connection.method === 'oauth') {
      if (!connection.accessToken) {
        throw new Error('Access token is required for BigQuery OAuth connection');
      }
    }

    const updatedProject: Project = {
      ...projects[projectIndex],
      rosettaConnection: {
        name: connection.name || projects[projectIndex].name,
        dbType: connection.type,
        databaseName: connection.database,
        schemaName: connection.schema,
        url: this.generateJdbcUrl(connection),
        userName: connection.type === 'bigquery' ? connection.project : connection.username,
        password: connection.type === 'bigquery' ? '' : connection.password,
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
  static async testConnection(connection: ConnectionInput): Promise<boolean | BigQueryTestResponse> {
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
          userName: connection.username,
          password: connection.password,
          url: this.generateJdbcUrl(connection),
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
            return `${baseUrl};ProjectId=${projectId};OAuthType=2;OAuthServiceAcctEmail=${credentials.client_email};OAuthPvtKeyPath=${credentials.private_key}`;
          } catch (err) {
            throw new Error('Invalid service account key JSON format');
          }
        } else if (conn.method === 'oauth') {
          if (conn.refreshToken) {
            // Use refresh token authentication for more stable long-term connections
            return `${baseUrl};ProjectId=${projectId};OAuthType=1;OAuthClientId=${conn.clientId};OAuthClientSecret=${conn.clientSecret};OAuthRefreshToken=${conn.refreshToken}`;
          } else if (conn.accessToken) {
            // Fallback to access token if no refresh token available
            return `${baseUrl};ProjectId=${projectId};OAuthType=0;OAuthAccessToken=${encodeURIComponent(conn.accessToken)}`;
          } else {
            throw new Error('Neither refresh token nor access token available for OAuth');
          }
        } else {
          throw new Error('Invalid authentication method for BigQuery');
        }
      default:
        throw new Error('Unsupported connection type!');
    }
  }

  private static mapToDbtConnection(conn: ConnectionInput): DBTConnection {
    const base: Omit<
      DBTConnection,
      'account' | 'warehouse' | 'role' | 'method' | 'project' | 'keyfile'
    > = {
      type: conn.type,
      username: conn.username,
      password: conn.password,
      database: conn.database,
      schema: conn.schema,
      ...('host' in conn && { host: conn.host }),
      ...('port' in conn && { port: conn.port }),
    };

    switch (conn.type) {
      case 'snowflake':
        return {
          ...base,
          type: 'snowflake',
          account: conn.account,
          warehouse: conn.warehouse,
          ...(conn.role && { role: conn.role }),
        };
      case 'bigquery':
        return {
          ...base,
          type: 'bigquery',
          method: conn.method,
          project: conn.project,
          ...(conn.keyfile && { keyfile: conn.keyfile }),
          ...(conn.location && { location: conn.location }),
          ...(conn.priority && { priority: conn.priority }),
          ...(conn.method === 'oauth' && {
            clientId: conn.clientId,
            clientSecret: conn.clientSecret,
            accessToken: conn.accessToken,
            refreshToken: conn.refreshToken,
          }),
        };
      case 'postgres':
        return {
          ...base,
          type: 'postgres',
          host: conn.host,
          port: conn.port,
        };
      case 'redshift':
        return {
          ...base,
          type: 'redshift',
          host: conn.host,
          port: conn.port,
        };
      default:
        return conn;
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
          try {
            profile.keyfile_json = JSON.parse(conn.keyfile || '{}');
          } catch (err) {
            throw new Error('Invalid service account key JSON format');
          }
        } else if (conn.method === 'oauth') {
          // Set OAuth credentials directly in profile instead of using oauth_credentials object
          profile.client_id = conn.clientId;
          profile.client_secret = conn.clientSecret;
          profile.refresh_token = conn.refreshToken;
        }

        return profile;

      default:
        throw new Error('Unsupported connection type!');
    }
  }
}
