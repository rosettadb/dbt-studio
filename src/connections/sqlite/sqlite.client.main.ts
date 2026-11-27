/* eslint-disable prefer-promise-reject-errors, consistent-return */
import SqliteDatabase from 'better-sqlite3';
import fs from 'fs';
import {
  QueryResponseType,
  SQLiteConnection,
  Table,
} from '../../types/backend';

export function testSQLiteConnection(config: SQLiteConnection): boolean {
  if (!config.database_path) {
    throw new Error('SQLite database path is required.');
  }

  let database: SqliteDatabase.Database | null = null;
  try {
    const stats = fs.statSync(config.database_path);
    if (stats.isDirectory()) {
      throw new Error(
        'The selected path is a directory. Please select a SQLite database file.',
      );
    }

    database = new SqliteDatabase(config.database_path, {
      readonly: true,
      fileMustExist: true,
    });
    const result = database
      .prepare('SELECT sqlite_version() AS version')
      .get() as { version?: string } | undefined;
    return Boolean(result?.version);
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      throw new Error('The selected SQLite database file does not exist.');
    }
    if (error?.code === 'SQLITE_NOTADB' || error?.code === 'SQLITE_CORRUPT') {
      throw new Error(
        'The selected file is not a valid SQLite database or is corrupted.',
      );
    }
    if (error?.code === 'SQLITE_CANTOPEN') {
      throw new Error(
        'The SQLite database could not be opened. Check the file path and permissions.',
      );
    }
    throw error;
  } finally {
    database?.close();
  }
}

function normalizeSQLiteValue(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return Number.isSafeInteger(Number(value))
      ? Number(value)
      : value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  return value;
}

export function executeSQLiteQuery(
  config: SQLiteConnection,
  query: string,
): QueryResponseType {
  let database: SqliteDatabase.Database | null = null;
  try {
    database = new SqliteDatabase(config.database_path, {
      fileMustExist: true,
    });
    const statement = database.prepare(query);

    if (statement.reader) {
      const columns = statement.columns();
      const data = (statement.all() as Record<string, unknown>[]).map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key,
            normalizeSQLiteValue(value),
          ]),
        ),
      );
      return {
        success: true,
        data: data as any[],
        fields: columns.map((column) => ({ name: column.name, type: -1 })),
        rowCount: data.length,
      };
    }

    const result = statement.run();
    const statementType = query.trimStart().split(/\s+/, 1)[0]?.toUpperCase();
    const commandType = ['INSERT', 'UPDATE', 'DELETE', 'REPLACE'].includes(
      statementType,
    )
      ? 'DML'
      : 'DDL';
    return {
      success: true,
      data: [],
      fields: [],
      rowCount: result.changes,
      isCommand: true,
      commandType,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || 'Unknown error occurred during query execution',
    };
  } finally {
    database?.close();
  }
}

function quoteSQLiteIdentifier(identifier: string): string {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function extractSQLiteSchema(config: SQLiteConnection): Table[] {
  let database: SqliteDatabase.Database | null = null;
  try {
    database = new SqliteDatabase(config.database_path, {
      readonly: true,
      fileMustExist: true,
    });
    const objects = database
      .prepare(
        `SELECT name, type
         FROM sqlite_schema
         WHERE type IN ('table', 'view')
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
      )
      .all() as { name: string; type: 'table' | 'view' }[];

    const objectsWithColumns = objects.map((object) => {
      const quotedName = quoteSQLiteIdentifier(object.name);
      const columns = database!
        .prepare(`PRAGMA table_xinfo(${quotedName})`)
        .all() as {
        cid: number;
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];
      const foreignKeyRows =
        object.type === 'table'
          ? (database!
              .prepare(`PRAGMA foreign_key_list(${quotedName})`)
              .all() as {
              id: number;
              /** Position of this column within the key, from 0. */
              seq: number;
              table: string;
              from: string;
              to: string | null;
              on_delete: string;
            }[])
          : [];
      return { object, columns, foreignKeyRows };
    });

    // A key names its tables and columns as typed (`REFERENCES Customers(ID)`)
    // and SQLite ignores the case of A–Z only (Ä and ä are two names), so
    // they are matched to the real names here.
    const asciiLower = (value: string) =>
      value.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
    const objectByLowerName = new Map(
      objectsWithColumns.map((entry) => [asciiLower(entry.object.name), entry]),
    );
    const realColumnName = (
      columns: { name: string }[] | undefined,
      name: string,
    ) =>
      columns?.find((column) => asciiLower(column.name) === asciiLower(name))
        ?.name ?? name;
    // `REFERENCES parent` (no columns) points at the target's primary key:
    // the key's first column at the primary key's first column, and so on.
    const referencedColumnName = (
      table: string,
      to: string | null,
      seq: number,
    ) => {
      const target = objectByLowerName.get(asciiLower(table));
      if (to !== null) return realColumnName(target?.columns, to);
      return target?.columns.find((column) => column.pk === seq + 1)?.name;
    };

    return objectsWithColumns.map(({ object, columns, foreignKeyRows }) => ({
      name: object.name,
      type: object.type.toUpperCase(),
      schema: 'main',
      columns: columns.map((column) => ({
        name: column.name,
        typeName: column.type || 'UNKNOWN',
        ordinalPosition: column.cid + 1,
        primaryKeySequenceId: column.pk,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey: column.pk > 0,
        nullable: column.notnull === 0,
        foreignKeys: foreignKeyRows
          .filter((fk) => realColumnName(columns, fk.from) === column.name)
          .flatMap((fk) => {
            const primaryColumnName = referencedColumnName(
              fk.table,
              fk.to,
              fk.seq,
            );
            if (!primaryColumnName) return [];
            return [
              {
                name: `fk_${object.name}_${fk.id}`,
                schema: 'main',
                tableName: object.name,
                columnName: column.name,
                deleteRule: fk.on_delete,
                primaryTableSchema: 'main',
                primaryTableName:
                  objectByLowerName.get(asciiLower(fk.table))?.object.name ??
                  fk.table,
                primaryColumnName,
              },
            ];
          }),
      })),
    }));
  } finally {
    database?.close();
  }
}
