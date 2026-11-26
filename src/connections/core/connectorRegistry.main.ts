import { registerDescriptor } from '../registry.shared';
import {
  Connection,
  type QueryContext,
  type TestResult,
} from './Connection.main';
import type { ConnectionDescriptor } from './descriptor.shared';
import type { AgentHintContext } from './agentHints.main';
import type { QueryResponseType, Table } from '../../types/backend';

/**
 * The databases that can be used in this run: Studio's own and the ones
 * extensions added. Every lookup below reads this.
 */
const registeredConnectors = new Map<string, Connection<any>>();

/**
 * Adds a database. Studio's own connectors and those of extensions come in
 * through this one call. Returns the function that takes it out again (and
 * disposes it). A type that is already taken is refused.
 */
export function registerConnector(connector: Connection<any>): () => void {
  const { type } = connector;
  if (registeredConnectors.has(type)) {
    throw new Error(`Connection type "${type}" is already registered`);
  }
  const removeDescriptor = registerDescriptor(connector.descriptor);
  registeredConnectors.set(type, connector);
  return () => {
    if (registeredConnectors.get(type) !== connector) return;
    registeredConnectors.delete(type);
    removeDescriptor();
    connector.dispose();
  };
}

/** Every database that can be used, Studio's own first. */
export const listConnectors = (): Connection<any>[] =>
  Array.from(registeredConnectors.values());

/**
 * A database written as a plain object, for code that cannot extend
 * `Connection` (an installed extension is loaded at run time and has no
 * access to Studio's classes). What is left out gets the default.
 */
export type ConnectionDefinition<Conn = any> = {
  descriptor: ConnectionDescriptor<string, Conn>;
  /** Throws with a message for the user when the settings are not usable. */
  validate: (conn: Conn) => Promise<void> | void;
  test: (conn: Conn) => Promise<TestResult> | TestResult;
  query: (
    conn: Conn,
    sql: string,
    ctx: QueryContext,
  ) => Promise<QueryResponseType>;
  extractSchema: (conn: Conn) => Promise<{ tables: Table[] }>;
  /** Whether two saved connections point at the same database. Default: every setting but the name is equal. */
  sameTarget?: (a: Conn, b: Conn) => boolean;
  /** Base for a generated connection name. Default: the connection's name. */
  nameHint?: (conn: Conn) => string;
  /** The "## Dialect Specifics" text for the AI agents. Default: the general one. */
  agentHint?: (ctx: AgentHintContext) => string;
  /** Run `validate` before a new connection is saved. Default: false. */
  validatesOnSave?: boolean;
  /** Clean-up when the database is taken out or Studio quits. */
  dispose?: () => void;
};

// A connection's settings, without its name, in a stable order.
const withoutName = (conn: Record<string, unknown>): string =>
  JSON.stringify(
    Object.keys(conn ?? {})
      .filter((key) => key !== 'name')
      .sort()
      .map((key) => [key, conn[key]]),
  );

class DefinedConnector extends Connection<any> {
  readonly descriptor: ConnectionDescriptor<any, any>;

  readonly validatesOnSave: boolean;

  private readonly definition: ConnectionDefinition;

  constructor(definition: ConnectionDefinition) {
    super();
    const type = definition?.descriptor?.type;
    (['validate', 'test', 'query', 'extractSchema'] as const).forEach(
      (name) => {
        if (typeof definition?.[name] !== 'function') {
          throw new Error(`Connection "${type}" needs a \`${name}\` function`);
        }
      },
    );
    this.definition = definition;
    this.descriptor = definition.descriptor;
    this.validatesOnSave = definition.validatesOnSave === true;
  }

  async validate(conn: any): Promise<void> {
    await this.definition.validate(conn);
  }

  async test(conn: any): Promise<TestResult> {
    return this.definition.test(conn);
  }

  async query(
    conn: any,
    sql: string,
    ctx: QueryContext,
  ): Promise<QueryResponseType> {
    return this.definition.query(conn, sql, ctx);
  }

  async extractSchema(conn: any): Promise<{ tables: Table[] }> {
    return this.definition.extractSchema(conn);
  }

  sameTarget(a: any, b: any): boolean {
    return this.definition.sameTarget
      ? this.definition.sameTarget(a, b)
      : withoutName(a) === withoutName(b);
  }

  nameHint(conn: any): string {
    return this.definition.nameHint?.(conn) ?? conn.name;
  }

  agentHint(ctx: AgentHintContext): string {
    return this.definition.agentHint?.(ctx) ?? super.agentHint(ctx);
  }

  dispose(): void {
    this.definition.dispose?.();
  }
}

/** The connector for a database written as a plain object. */
export const connectorFromDefinition = (
  definition: ConnectionDefinition,
): Connection<any> => new DefinedConnector(definition);

/** Exact type. Unknown or removed types (a legacy 'db2' row) return undefined. */
export function getConnector(
  type: string | undefined,
): Connection<any> | undefined {
  return type ? registeredConnectors.get(type) : undefined;
}
