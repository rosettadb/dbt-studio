import type { Project, RosettaConnection } from '../../types/backend';
import type { ConnectionInput, DBTConnection } from '../registry.shared';
import { Connection } from './Connection.main';

export type ProfileImportContext = {
  /** profiles.yml being imported (DuckDB resolves relative paths against its folder). */
  profilesPath: string;
  /** ConnectorsService.resolveExactEnvVar: `{{ env_var("X") }}` → process.env.X. */
  resolveEnvVar: (value: unknown) => unknown;
};

/** One entry of main.conf `connections:`. Property order is the file's key order. */
export type MainConfEntry = {
  name: string;
  databaseName: string;
  schemaName: string;
  dbType: string;
  url: string;
  [key: string]: unknown;
};

/**
 * A database that can back a dbt project: profiles.yml in and out, the dbt
 * connection, and the project's Rosetta files (JDBC URL, main.conf entry).
 */
export abstract class ConnectionDbt<
  T extends ConnectionInput = ConnectionInput,
  D extends DBTConnection = DBTConnection,
> extends Connection<T> {
  /** profiles.yml `type:` that parseProjectConnectionFiles imports with this class. */
  readonly dbtAdapterType: string | undefined = undefined;

  /** false: updateConnection leaves the project's files alone (DuckLake). */
  readonly supportsPartialUpdate: boolean = true;

  /** Today's mapToDbtConnection case. */
  abstract toDbtConnection(conn: T): D;

  /** The `outputs.dev` object of a generated profiles.yml. The only copy. */
  abstract toProfileOutput(conn: T): Promise<Record<string, unknown>>;

  /** Today's parseProfilesYml case. */
  fromProfileOutput(
    _output: Record<string, any>,
    _ctx: ProfileImportContext,
  ): D | null {
    return null;
  }

  /** Today's mapDBTConnectionToConnectionInput case. */
  toConnectionInput(_dbt: D, _name: string): T | null {
    return null;
  }

  /** Fields merged into an existing profiles.yml dev output. `threads` stays the user's. */
  async profilePatch(conn: T): Promise<Record<string, unknown>> {
    const fields = { ...(await this.toProfileOutput(conn)) };
    delete fields.threads;
    return fields;
  }

  /** Keys deleted from the existing dev output after the merge. */
  profileKeysToRemove(_conn: T): string[] {
    return [];
  }

  /** Rosetta JDBC URL with `${db-<field>-<name>}` placeholders. The only copy. */
  abstract toJdbcUrl(conn: T): string;

  /** generateRosettaYml's entry. Key order: name, databaseName, schemaName, dbType, url, extras. */
  async toMainConfEntry(conn: T, projectName: string): Promise<MainConfEntry> {
    return {
      name: projectName,
      ...this.mainConfNames(conn, projectName),
      dbType: conn.type,
      url: this.toJdbcUrl(conn),
      ...(await this.mainConfExtras(conn)),
    };
  }

  /** What updateMainConf writes into an existing entry. Override only for a declined DIFF. */
  async mainConfPatch(conn: T, projectName: string): Promise<MainConfEntry> {
    return this.toMainConfEntry(conn, projectName);
  }

  /** Keys updateMainConf deletes from the existing entry. */
  mainConfKeysToRemove(_conn: T): string[] {
    return ['authenticator'];
  }

  protected mainConfNames(
    conn: T,
    _projectName: string,
  ): { databaseName: string; schemaName: string } {
    return {
      databaseName: this.rosettaRef(conn, 'dbname'),
      schemaName: this.rosettaRef(conn, 'schema'),
    };
  }

  /** Credential refs (and DuckLake paths). Default: user and password refs. */
  protected async mainConfExtras(conn: T): Promise<Record<string, unknown>> {
    return {
      userName: this.rosettaRef(conn, 'user'),
      password: this.rosettaRef(conn, 'password'),
    };
  }

  /** Today's mapToRosettaConnection. */
  toRosettaConnection(conn: T, project: Project): RosettaConnection {
    return {
      name: conn.name || project.name,
      dbType: conn.type,
      databaseName: this.rosettaDatabaseName(conn),
      schemaName: this.rosettaSchemaName(conn),
      url: this.toJdbcUrl(conn),
      ...this.rosettaCredentialRefs(conn),
    };
  }

  protected rosettaDatabaseName(conn: T): string {
    return (conn as unknown as { database: string }).database;
  }

  protected rosettaSchemaName(conn: T): string {
    return (conn as unknown as { schema: string }).schema;
  }

  protected rosettaCredentialRefs(
    conn: T,
  ): Pick<RosettaConnection, 'userName' | 'password'> {
    return 'username' in conn && 'password' in conn
      ? {
          userName: `db-user-${conn.name}`,
          password: `db-password-${conn.name}`,
        }
      : {};
  }

  /** loadConfigurations, before profiles.yml and main.conf are written. */
  // eslint-disable-next-line no-empty-function
  async prepareProjectEnv(_conn: T): Promise<void> {}

  /** `{{ env_var("db-<field>-<name>") }}`, today's `envVar`. */
  protected profileRef(conn: T, field: string): string {
    return `{{ env_var("db-${field}-${conn.name}") }}`;
  }

  /** Today's `envVarInt`. */
  protected profileRefInt(conn: T, field: string): string {
    return `{{ env_var("db-${field}-${conn.name}") | int }}`;
  }

  /** `${db-<field>-<name>}`, today's `ev` in generateJdbcUrl and generateRosettaYml. */
  protected rosettaRef(conn: T, field: string): string {
    return `\${db-${field}-${conn.name}}`;
  }
}
