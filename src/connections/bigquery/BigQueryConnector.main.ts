import type { QueryResponseType, Table } from '../../types/backend';
import SecureStorageService from '../../main/services/secureStorage.service';
import { ConnectionDbt } from '../core/ConnectionDbt.main';
import type { QueryContext, TestResult } from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import {
  bigqueryDescriptor,
  type BigQueryConnection,
  type BigQueryDBTConnection,
} from './bigquery.shared';
import {
  executeBigQueryQuery,
  testBigQueryConnection,
} from './bigquery.client.main';
import BigQueryExtractor from './bigquery.extractor.main';
import {
  BigQueryKeyFiles,
  sanitizeBigQueryKeyfile,
} from './bigquery.keyfile.main';

export class BigQueryConnector extends ConnectionDbt<
  BigQueryConnection,
  BigQueryDBTConnection
> {
  readonly descriptor = bigqueryDescriptor;

  readonly dbtAdapterType = 'bigquery';

  readonly secretMaterializers = [
    {
      prefix: 'db-bigquery-',
      materialize: (connectionName: string, value: string) =>
        BigQueryKeyFiles.materializeBigQueryServiceAccount(
          connectionName,
          value,
        ),
    },
  ];

  // CS validateConnection (1282-1284)
  async validate(conn: BigQueryConnection): Promise<void> {
    if (!('project' in conn)) throw new Error('Project ID is required');
  }

  // CS testConnection (902-903)
  test(conn: BigQueryConnection): Promise<TestResult> {
    return testBigQueryConnection(conn);
  }

  // CS executeSelectStatement (1091-1094): BigQuery cancellation is not implemented
  query(
    conn: BigQueryConnection,
    sql: string,
    _ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeBigQueryQuery(conn, sql);
  }

  // CS extractSchemaFromConnection (2319-2353), `bqConn` -> `conn`
  async extractSchema(conn: BigQueryConnection): Promise<{ tables: Table[] }> {
    const config: any = {
      projectId: conn.project,
    };
    let keyfileValue = conn.keyfile;
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
    if (conn.location) {
      config.location = conn.location;
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

  // CS areConnectionConfigsEqual (267-278)
  sameTarget(a: BigQueryConnection, b: BigQueryConnection): boolean {
    return (
      a.project === b.project &&
      a.database === b.database &&
      a.schema === b.schema &&
      a.keyfile === b.keyfile
    );
  }

  // CS generateUniqueConnectionName (404-406)
  nameHint(conn: BigQueryConnection): string {
    return conn.project;
  }

  // sqlAgent.ts 76-79; identical in the three agents
  agentHint(_ctx: AgentHintContext): string {
    return '\n\n## Dialect Specifics\nYou are connected to Google BigQuery. Ensure all queries use BigQuery Standard SQL syntax.';
  }

  // CS mapToDbtConnection (1436-1448)
  toDbtConnection(conn: BigQueryConnection): BigQueryDBTConnection {
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
  }

  // CS mapToDbtProfileOutput (1607-1619), plus DIFF-4 (location)
  async toProfileOutput(
    conn: BigQueryConnection,
  ): Promise<Record<string, unknown>> {
    const profile: any = {
      type: 'bigquery',
      method: conn.method,
      project: this.profileRef(conn, 'project'),
      dataset: this.profileRef(conn, 'dataset'),
      threads: 4,
      priority: conn.priority || 'interactive',
      keyfile: this.profileRef(conn, 'bigquery'),
    };

    if (conn.location) profile.location = conn.location;

    return profile;
  }

  // CS parseProfilesYml (1794-1807)
  fromProfileOutput(devOutput: Record<string, any>): BigQueryDBTConnection {
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
  }

  // CS mapDBTConnectionToConnectionInput (1917-1935)
  toConnectionInput(
    dbtConnection: BigQueryDBTConnection,
    connectionName: string,
  ): BigQueryConnection {
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
  }

  // CS generateJdbcUrl (1340-1342)
  toJdbcUrl(conn: BigQueryConnection): string {
    return `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${this.rosettaRef(conn, 'project')};OAuthType=0;OAuthServiceAcctEmail=${this.rosettaRef(conn, 'bigquery-email')};OAuthPvtKeyPath=${this.rosettaRef(conn, 'bigquery')};`;
  }

  // CS generateRosettaYml (1174-1176)
  protected mainConfNames(conn: BigQueryConnection): {
    databaseName: string;
    schemaName: string;
  } {
    return {
      databaseName: this.rosettaRef(conn, 'project'),
      schemaName: this.rosettaRef(conn, 'dataset'),
    };
  }

  // BigQuery gets no user or password (CS 1228-1232)
  protected async mainConfExtras(): Promise<Record<string, unknown>> {
    return {};
  }

  protected rosettaCredentialRefs(): Record<string, never> {
    return {};
  }

  // yamlPartialUpdate: types without credentials drop these keys
  mainConfKeysToRemove(): string[] {
    return ['userName', 'password', 'authenticator'];
  }

  // CS loadConfigurations (539-554): the service-account key file
  async prepareProjectEnv(conn: BigQueryConnection): Promise<void> {
    if (conn.method !== 'service-account') return;
    const account = `db-bigquery-${conn.name}`;
    const serviceAccount = await SecureStorageService.getCredential(account);
    if (!serviceAccount) {
      throw new Error(
        'BigQuery service account key not found in secure storage',
      );
    }
    await BigQueryKeyFiles.materializeBigQueryServiceAccount(
      conn.name,
      serviceAccount,
    );
  }

  sanitizeStoredConnection(conn: BigQueryConnection): void {
    sanitizeBigQueryKeyfile({ connection: conn });
  }

  dispose(): void {
    BigQueryKeyFiles.cleanupBigQueryKeyFiles();
  }
}
