import SecureStorageService from '../../main/services/secureStorage.service';
import type {
  BigQueryTestResponse,
  QueryResponseType,
  Table,
} from '../../types/backend';
import type { ConnectionInput } from '../registry.shared';
import type { ConnectionDescriptor } from './descriptor.shared';
import { defaultAgentHint, type AgentHintContext } from './agentHints.main';

export type QueryContext = {
  /** Registers the function that cancels the running statement (today's `registerCancel`). */
  onCancelable?: (cancel: () => void) => void;
};

export type TestResult = boolean | BigQueryTestResponse;

/** Pagination SQL for notebook SQL cells when LIMIT/OFFSET doesn't apply (Oracle). */
export type NotebookPaging = {
  stripTrailingPagination(sql: string): string;
  pagedQuery(
    baseSql: string,
    orderBy: string,
    limit: number,
    offset: number,
  ): string;
  countQuery(baseSql: string): string;
  normalizeCount(value: unknown): number | undefined;
};

/** A secret that setConnectionEnvVariable writes to a file instead of process.env (BigQuery). */
export type SecretMaterializer = {
  /** Env key prefix, e.g. 'db-bigquery-'. */
  prefix: string;
  materialize: (connectionName: string, value: string) => Promise<void>;
};

/**
 * One database. Subclasses implement the abstract members by moving today's
 * switch cases verbatim (see Plan 85a §6). Instances are stateless singletons
 * created in registry.main.ts.
 */
export abstract class Connection<T extends ConnectionInput = ConnectionInput> {
  abstract readonly descriptor: ConnectionDescriptor<T['type'], T>;

  get type(): T['type'] {
    return this.descriptor.type;
  }

  /** Throws today's message, word for word. */
  abstract validate(conn: T): Promise<void>;

  abstract test(conn: T): Promise<TestResult>;

  abstract query(
    conn: T,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType>;

  abstract extractSchema(conn: T): Promise<{ tables: Table[] }>;

  /** Today's areConnectionConfigsEqual case. Both types are already equal. */
  abstract sameTarget(a: T, b: T): boolean;

  /** Today's generateUniqueConnectionName base name. */
  abstract nameHint(conn: T): string;

  /**
   * A copy of `conn` with keytar secrets applied. `keyFor(secretKey)` returns
   * the `<name>` part of `db-<secretKey>-<name>`. Fields are set only when a
   * value exists, as today.
   */
  async resolveSecrets(
    conn: T,
    keyFor: (secretKey: string) => string,
  ): Promise<T> {
    const { secrets } = this.descriptor;
    const values = await Promise.all(
      secrets.map((secret) =>
        SecureStorageService.getCredential(
          `db-${secret.key}-${keyFor(secret.key)}`,
        ),
      ),
    );
    const copy: Record<string, unknown> = { ...conn };
    secrets.forEach((secret, index) => {
      if (values[index]) copy[secret.field] = values[index];
    });
    return copy as T;
  }

  /** ProjectsService.extractSchema. */
  async extractProjectSchema(conn: T): Promise<Table[]> {
    return (await this.extractSchema(conn)).tables;
  }

  /** The "## Dialect Specifics" text the AI agents append. */
  agentHint(ctx: AgentHintContext): string {
    return defaultAgentHint(ctx.requestedType);
  }

  readonly notebookPaging: NotebookPaging | null = null;

  /** saveNewConnection and saveNewConnectionForTemplate validate first. */
  readonly validatesOnSave: boolean = false;

  /** The connection object written to database.json on save and update. */
  prepareForStorage(conn: T): T {
    return conn;
  }

  /** Runs on every connection row at every database.json write. Mutates in place. */
  sanitizeStoredConnection(_conn: T): void {}

  /** saveNewConnection only, before the row is written. */
  // eslint-disable-next-line no-empty-function
  async onSave(_conn: T): Promise<void> {}

  /** updateConnection, after the write, when the name changed. */
  // eslint-disable-next-line no-empty-function
  async onRename(_previous: ConnectionInput, _next: T): Promise<void> {}

  readonly secretMaterializers: readonly SecretMaterializer[] = [];

  /** App-lifetime cleanup. */
  dispose(): void {}
}
