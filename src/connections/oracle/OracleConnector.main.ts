import SecureStorageService from '../../main/services/secureStorage.service';
import type { QueryResponseType, Table } from '../../types/backend';
import type { ConnectionInput } from '../registry.shared';
import {
  Connection,
  type NotebookPaging,
  type QueryContext,
  type TestResult,
} from '../core/Connection.main';
import type { AgentHintContext } from '../core/agentHints.main';
import { oracleDescriptor, type OracleConnection } from './oracle.shared';
import {
  prepareOracleConnection,
  validateOracleConnection,
} from './oracle.helpers.shared';
import {
  buildCountQuery,
  buildPagedQuery,
  executeOracleQuery,
  listOracleWalletAliases,
  normalizeCount,
  removeTrailingPagination,
  testOracleConnection,
} from './oracle.client.main';
import OracleExtractor from './oracle.extractor.main';

export class OracleConnector extends Connection<OracleConnection> {
  readonly descriptor = oracleDescriptor;

  readonly validatesOnSave = true;

  readonly notebookPaging: NotebookPaging = {
    stripTrailingPagination: removeTrailingPagination,
    pagedQuery: buildPagedQuery,
    countQuery: buildCountQuery,
    normalizeCount,
  };

  /** CS oracleSecrets (82-97), verbatim. Keyed by connection name in every path. */
  // eslint-disable-next-line class-methods-use-this
  private async secrets(conn: OracleConnection, test = false) {
    return {
      password:
        (test ? conn.password : '') ||
        (await SecureStorageService.getCredential(
          `db-password-${conn.name}`,
        )) ||
        '',
      walletPassword:
        (test ? conn.walletPassword : '') ||
        (await SecureStorageService.getCredential(
          `db-walletpassword-${conn.name}`,
        )) ||
        undefined,
    };
  }

  /** Oracle reads its own secrets (above) and never mutates the connection. */
  async resolveSecrets(conn: OracleConnection): Promise<OracleConnection> {
    return conn;
  }

  // CS validateConnection, case 'oracle' (1265-1271)
  async validate(conn: OracleConnection): Promise<void> {
    const error = validateOracleConnection(conn);
    if (error) throw new Error(error);
    if (conn.connectMode === 'wallet')
      await listOracleWalletAliases(conn.walletDir!);
  }

  // CS testConnection, case 'oracle' (927-931)
  async test(conn: OracleConnection): Promise<TestResult> {
    return testOracleConnection(conn, await this.secrets(conn, true));
  }

  // CS executeSelectStatement Oracle block (1022-1035). The coordinator sets duration.
  async query(
    conn: OracleConnection,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return executeOracleQuery(
      conn,
      sql,
      await this.secrets(conn),
      ctx.onCancelable,
    );
  }

  // CS extractSchemaFromConnection Oracle block (2184-2195)
  async extractSchema(conn: OracleConnection): Promise<{ tables: Table[] }> {
    const extractor = new OracleExtractor(conn, await this.secrets(conn));
    try {
      await extractor.connect();
      return await extractor.extractSchema();
    } finally {
      await extractor.disconnect();
    }
  }

  // CS areConnectionConfigsEqual, case 'oracle' (325-340), `other` -> b
  sameTarget(a: OracleConnection, b: OracleConnection): boolean {
    return (
      a.username === b.username &&
      a.schema === b.schema &&
      a.connectMode === b.connectMode &&
      (a.connectMode === 'basic'
        ? a.host === b.host &&
          a.port === b.port &&
          a.serviceName === b.serviceName &&
          !!a.tls === !!b.tls
        : a.connectString === b.connectString &&
          (a.connectMode !== 'wallet' || a.walletDir === b.walletDir))
    );
  }

  // CS generateUniqueConnectionName, case 'oracle' (372-379)
  nameHint(conn: OracleConnection): string {
    return (
      conn.serviceName ||
      (conn.connectMode === 'wallet' ? conn.connectString : '') ||
      'oracle'
    );
  }

  // sqlAgent.ts 92-95 / analyticsAgent differ from notebooksAgent.prompts.ts 63-64
  agentHint(ctx: AgentHintContext): string {
    return ctx.agent === 'notebooks'
      ? '\n\n## Dialect Specifics\nYou are connected to Oracle Database. Use Oracle SQL. Do not add row limits to queries; the UI handles pagination with `OFFSET ... FETCH NEXT`. The dummy table is `DUAL`, unquoted identifiers fold to uppercase, table aliases cannot use `AS`, catalog metadata lives in `ALL_*` views (`ALL_TABLES`, `ALL_USERS`, `ALL_TAB_COLUMNS`), and statements must not end with `;`.'
      : '\n\n## Oracle SQL\nUse FETCH FIRST n ROWS ONLY (no LIMIT); no AS before table aliases; unquoted identifiers are uppercase; dummy table is DUAL; do not end SQL with a semicolon; use DATE literals or TO_DATE; strings are VARCHAR2.';
  }

  // CS saveNewConnection / saveNewConnectionForTemplate / updateConnection
  // eslint-disable-next-line class-methods-use-this
  prepareForStorage(conn: OracleConnection): OracleConnection {
    return prepareOracleConnection(conn);
  }

  // CS updateConnection rename block (754-771)
  // eslint-disable-next-line class-methods-use-this
  async onRename(
    previous: ConnectionInput,
    next: OracleConnection,
  ): Promise<void> {
    if (previous.type !== 'oracle' || previous.name === next.name) return;
    // Credentials are keyed by name; drop the ones left under the old name.
    try {
      await SecureStorageService.cleanupConnectionCredentials(previous.name);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(
        `Failed to cleanup credentials for renamed connection ${previous.name}:`,
        error,
      );
    }
  }
}
