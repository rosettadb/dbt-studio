/* eslint-disable no-restricted-syntax, no-await-in-loop */
import yaml from 'js-yaml';
import path from 'path';
import fs from 'fs';
import { v4 as uuidV4 } from 'uuid';
import { NotebooksService } from './notebooks.service';
import {
  BigQueryTestResponse,
  ConnectionInput,
  ConnectionModel,
  DBTConnection,
  ExecuteStatementType,
  Project,
  QueryResponseType,
  RosettaConnection,
  canUseAsDbtConnection,
} from '../../types/backend';
import databaseStore from '../database';
import { ProjectsService } from './index';
import MainDatabaseService from './mainDatabase.service';
import { ConfigureConnectionBody, UpdateConnectionBody } from '../../types/ipc';
import SecureStorageService from './secureStorage.service';
import { CloudConnection, RecentItem } from '../../types/frontend';
import { updateProjectConfigFiles } from '../utils/yamlPartialUpdate';
import { getDescriptor } from '../../connections/registry.shared';
import {
  dbtConnectorForAdapter,
  disposeConnectors,
  findSecretMaterializer,
  getConnector,
  requireConnector,
  requireDbtConnector,
  sanitizeForStorage,
} from '../../connections/registry.main';
import { listOracleWalletAliases } from '../../connections/oracle/oracle.client.main';
import { createDuckDBDatabase } from '../../connections/duckdb/duckdb.client.main';
import {
  materializeSnowflakeOAuthEnv as materializeSnowflakeEnv,
  revokeSnowflakeSession as revokeSnowflake,
} from '../../connections/snowflake/snowflake.session.main';

export default class ConnectorsService {
  static oracleWalletAliases = listOracleWalletAliases;

  static duckdbCreateDatabase = createDuckDBDatabase;

  static cleanupBigQueryKeyFiles(): void {
    // settings.service.ts and the tests call this name; it disposes every connector.
    disposeConnectors();
  }

  static async loadConnections(
    includeDataLake: boolean = false,
  ): Promise<ConnectionModel[]> {
    const connections = (await databaseStore.getField('connections')) ?? [];

    // Filter out ducklake connections by default. Unknown (removed) types stay listed, as today.
    if (includeDataLake) {
      return connections;
    }

    return connections.filter(
      (conn) =>
        getDescriptor(conn.connection.type)?.capabilities.listedByDefault !==
        false,
    );
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
    if (conn1.type !== conn2.type) {
      return false;
    }
    return getConnector(conn1.type)?.sameTarget(conn1, conn2) ?? false;
  }

  /**
   * Generate a unique connection name based on connection details
   * Used when a connection with the default name exists but has different config
   */
  private static generateUniqueConnectionName(
    connection: ConnectionInput,
  ): string {
    const timestamp = Date.now();
    const baseName =
      getConnector(connection.type)?.nameHint(connection) ?? 'DBT Connection';
    return `${baseName}_${timestamp}`;
  }

  /**
   * Save a new connection
   */
  static async saveNewConnectionForTemplate(
    connection: ConnectionInput,
  ): Promise<string> {
    const connector = getConnector(connection.type);
    if (connector?.validatesOnSave) {
      await this.validateConnection(connection);
    }
    const persistedConnection = connector
      ? connector.prepareForStorage(connection)
      : connection;
    const connectionId = uuidV4();
    const newConnection: ConnectionModel = {
      id: connectionId,
      connection: persistedConnection,
    };

    await databaseStore.updateField('connections', (current) => {
      const connections = current ?? [];
      const nameValidation = this.validateConnectionName(
        connection.name,
        connections,
      );
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.message);
      }
      const next = [...connections, newConnection];
      next.forEach((conn) => sanitizeForStorage(conn));
      return next;
    });

    return connectionId;
  }

  static async saveNewConnection(connection: ConnectionInput): Promise<string> {
    const connector = getConnector(connection.type);
    if (connector?.validatesOnSave) {
      await this.validateConnection(connection);
    }
    const persistedConnection = connector
      ? connector.prepareForStorage(connection)
      : connection;
    const connectionId = uuidV4();

    await connector?.onSave(connection); // DuckLake: S3 credentials into secure storage

    const newConnection: ConnectionModel = {
      id: connectionId,
      connection: persistedConnection,
    };

    await databaseStore.updateField('connections', (current) => {
      const connections = current ?? [];
      const nameValidation = this.validateConnectionName(
        connection.name,
        connections,
      );
      if (!nameValidation.isValid) {
        throw new Error(nameValidation.message);
      }
      const next = [...connections, newConnection];
      next.forEach((conn) => sanitizeForStorage(conn));
      return next;
    });

    return connectionId;
  }

  static async getProjectById(projectId: string): Promise<Project | undefined> {
    const projects = await databaseStore.getField('projects');
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

    const connector = requireDbtConnector(
      connection.connection.type,
      `Unsupported connection type: ${connection.connection.type}`, // DIFF-10
    );
    await connector.prepareProjectEnv(connection.connection); // BigQuery key file, DuckLake S3 env

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

    if (projectIndex !== -1 && !canUseAsDbtConnection(connection.type)) {
      throw new Error(
        `${getDescriptor(connection.type)?.displayName ?? connection.type} connections cannot be used by dbt projects`,
      );
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
          connectionId = await this.saveNewConnectionForTemplate(connection);
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

    const previous = (await this.loadConnections(true)).find(
      (c) => c.id === connection.id,
    );

    const connector = getConnector(connection.connection.type);
    const prepared = connector
      ? connector.prepareForStorage(connection.connection)
      : connection.connection;
    const persistedModel =
      prepared === connection.connection
        ? connection
        : { ...connection, connection: prepared };

    await databaseStore.updateField('connections', (current) => {
      const connections = current ?? [];
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

      const updated = [...connections];
      updated[connectionIndex] = persistedModel;
      updated.forEach((conn) => sanitizeForStorage(conn));
      return updated;
    });

    if (previous && previous.connection.name !== connection.connection.name) {
      await connector?.onRename(previous.connection, connection.connection);
    }

    if (!canUseAsDbtConnection(connection.connection.type)) return;

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
    // (keyed by connection name, matching how they were written).
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

    // Archive notebooks for this connection
    // If archival fails, abort the deletion to prevent orphaned notebooks
    await NotebooksService.archiveConnectionNotebooks(connectionToDelete.id);

    // Remove the connection from the database
    await databaseStore.updateField('connections', (current) =>
      (current ?? []).filter((c) => c.id !== connectionId),
    );

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
  ): Promise<boolean | BigQueryTestResponse> {
    await this.validateConnection(connection);
    return requireConnector(
      connection.type,
      `Unsupported connection type: ${(connection as any).type}`,
    ).test(connection);
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

  // Unified Snowflake revoke across all credential layers so the
  // Connections screen, SQL Editor, and Selected Project screen observe the
  // same state: SDK token cache file, keychain secrets, and materialized
  // process env. Identity fields (username, account, …) are kept so forms
  // can re-hydrate; only secrets are removed.
  static async revokeSnowflakeSession(
    connectionName: string,
  ): Promise<boolean> {
    return revokeSnowflake(connectionName);
  }

  // Hands the live Snowflake OAuth session to dbt (Python driver) at run
  // time: reads the access token from the Node SDK's own cache file and
  // exports it as `db-token-<name>` process env, which OAuth profiles
  // reference via `{{ env_var(...) }}`. The token never touches profiles,
  // logs, keychain, or renderer state — same channel passwords already use.
  // Self-gating: no-op (false) unless the named connection is
  // Snowflake+oauth_browser. Returns true when a token was materialized.
  static async materializeSnowflakeOAuthEnv(
    connectionName: string,
  ): Promise<boolean> {
    const name = (connectionName ?? '').trim();
    if (!name) {
      return false;
    }
    const connection = await this.findConnectionByName(name);
    return materializeSnowflakeEnv(connection?.connection);
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
    const connector = getConnector(connection.type);
    const resolved = connector
      ? await connector.resolveSecrets(connection, () => projectName)
      : connection;

    const startTime = Date.now();
    let response: QueryResponseType;

    // Helper to register cancel callback if queryId is present
    const onCancelable = queryId
      ? (fn: () => void) => {
          this.runningQueries.set(queryId, fn);
        }
      : undefined;

    try {
      response = await requireConnector(
        connection.type,
        `Unsupported connection type: ${(connection as any).type}`,
      ).query(resolved, query, { onCancelable });
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
    const connector = requireDbtConnector(
      connection.type,
      'Unsupported connection type!',
    );
    const yamlData: {
      connections: RosettaConnection[];
      openai_api_key?: string;
    } = {
      openai_api_key: `\${openai-api-key}`,
      connections: [
        (await connector.toMainConfEntry(
          connection,
          projectName,
        )) as unknown as RosettaConnection,
      ],
    };
    return yaml.dump(yamlData);
  }

  static async validateConnection(conn: ConnectionInput): Promise<void> {
    if (!conn.type) {
      throw new Error('Connection type is required');
    }
    await requireConnector(conn.type, 'Unsupported connection type!').validate(
      conn,
    );
  }

  static async generateJdbcUrl(conn: ConnectionInput): Promise<string> {
    return requireDbtConnector(
      conn.type,
      'Unsupported connection type!',
    ).toJdbcUrl(conn);
  }

  private static async mapToRosettaConnection(
    connection: ConnectionInput,
    project: Project,
  ): Promise<RosettaConnection> {
    return requireDbtConnector(
      connection.type,
      'Unsupported connection type!',
    ).toRosettaConnection(connection, project);
  }

  private static mapToDbtConnection(conn: ConnectionInput): DBTConnection {
    return requireDbtConnector(
      conn.type,
      `Unsupported connection type: ${(conn as ConnectionInput).type}`,
    ).toDbtConnection(conn);
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
    return this.mapToDbtProfiles(name, connection);
  }

  private static async mapToDbtProfileOutput(
    conn: ConnectionInput,
  ): Promise<any> {
    return requireDbtConnector(
      conn.type,
      'Unsupported connection type!',
    ).toProfileOutput(conn);
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
   * Resolves a profiles.yml value of the exact form `{{ env_var("NAME") }}`
   * (as written by generateProfilesYml) from process.env. Any other value,
   * or a placeholder whose variable is not set, is returned unchanged.
   */
  private static resolveExactEnvVar(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    const match = value.match(
      /^\s*\{\{\s*env_var\(\s*["']([^"']+)["']\s*\)\s*\}\}\s*$/,
    );
    if (!match) return value;
    return process.env[match[1]] ?? value;
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

      const connector = dbtConnectorForAdapter(devOutput.type);
      return connector
        ? connector.fromProfileOutput(devOutput, {
            profilesPath,
            resolveEnvVar: (value) => this.resolveExactEnvVar(value),
          })
        : null;
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
      return (
        dbtConnectorForAdapter(dbtConnection.type)?.toConnectionInput(
          dbtConnection,
          connectionName,
        ) ?? null
      );
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
    const materializer = findSecretMaterializer(key);
    if (materializer) {
      await materializer.materialize(materializer.connectionName, value);
      return;
    }

    process.env[key] = value;
  }

  /**
   * Validate connection name for uniqueness
   */
  private static validateConnectionName(
    name: string,
    existingConnections: ConnectionModel[],
    excludeId?: string,
  ): { isValid: boolean; message?: string } {
    // Check for empty name
    if (!name.trim()) {
      return {
        isValid: false,
        message: 'Connection name cannot be empty',
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
    const sources = await databaseStore.getField('sources');
    return sources ?? [];
  }

  static async saveCloudConnection(connection: CloudConnection): Promise<void> {
    await databaseStore.updateField('sources', (current) => {
      const sources = current ?? [];
      const existingIndex = sources.findIndex((c) => c.id === connection.id);
      if (existingIndex >= 0) {
        const updated = [...sources];
        updated[existingIndex] = connection;
        return updated;
      }
      return [...sources, connection];
    });
  }

  static async deleteCloudConnection(id: string): Promise<void> {
    const sources = (await databaseStore.getField('sources')) ?? [];
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

    await databaseStore.updateField('sources', (current) =>
      (current ?? []).filter((c) => c.id !== id),
    );
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
      const items = (await databaseStore.getField('recentItems')) ?? [];
      return [...items].sort(
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
    await databaseStore.updateField('recentItems', (current) => {
      const items = (current ?? []).filter((i) => i.id !== item.id);
      const next = [{ ...item, accessedAt: new Date() }, ...items];
      return next.slice(0, 50);
    });
  }

  static async removeRecentItem(id: string): Promise<void> {
    await databaseStore.updateField('recentItems', (current) =>
      (current ?? []).filter((i) => i.id !== id),
    );
  }

  static async clearRecentItems(): Promise<void> {
    await databaseStore.updateField('recentItems', () => []);
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

    const connector = requireConnector(
      connection.type,
      `Unsupported connection type: "${(connection as any).type}"`,
    );
    const resolved = await connector.resolveSecrets(
      connection,
      () => connection.name,
    );
    return connector.extractSchema(resolved);
  }

  /**
   * Save a query for a specific connection (connection-based, not project-based)
   */
  static async updateConnectionQuery(
    connectionId: string,
    query: string,
  ): Promise<void> {
    // Use a connection-specific key prefix to distinguish from project queries
    await databaseStore.updateField('queries', (current) => ({
      ...(current ?? {}),
      [`connection:${connectionId}`]: query,
    }));
  }

  /**
   * Get the saved query for a specific connection
   */
  static async getConnectionQuery(connectionId: string): Promise<string> {
    const queries = await databaseStore.getField('queries');
    return queries?.[`connection:${connectionId}`] ?? '';
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
    const connector = getConnector(connection.type);
    const resolved = connector
      ? await connector.resolveSecrets(connection, () => connection.name)
      : connection;

    // Use a dummy project name for credential lookup (use connection name)
    return this.executeSelectStatement({
      connection: resolved,
      query,
      projectName: connection.name,
      queryId,
    });
  }
}
