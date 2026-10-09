/* eslint-disable no-control-regex, no-restricted-syntax, no-await-in-loop */
import fs from 'fs/promises';
import path from 'path';
import type { Connection, Metadata, ResultSet, Lob } from 'oracledb';
import type { OracleConnection, QueryResponseType } from '../../types/backend';
import {
  buildOracleEasyConnect,
  validateOracleConnection,
  normalizeOracleIdentifier,
  scrubOracleSecrets,
  parseOracleWalletAliases,
  isOraclePlSql,
  isSupportedOracleVersion,
} from '../../shared/oracle';

type OracleDriver = typeof import('oracledb');

let driverPromise: Promise<OracleDriver> | undefined;

/** Load only on first Oracle use; no Instant Client or native initialization. */
export function loadOracleDriver(): Promise<OracleDriver> {
  if (!driverPromise) {
    driverPromise = import('oracledb')
      .then((module) => {
        const driver = module.default;
        if (driver.thin !== true) {
          throw new Error('Oracle Thin mode is required');
        }
        return driver;
      })
      .catch((error: unknown) => {
        driverPromise = undefined;
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`Oracle driver unavailable: ${reason}`);
      });
  }
  return driverPromise;
}

export type OracleSecrets = { password: string; walletPassword?: string };

export async function listOracleWalletAliases(
  walletDir: string,
): Promise<string[]> {
  if (
    typeof walletDir !== 'string' ||
    !walletDir.trim() ||
    /[\u0000-\u001f\u007f]/.test(walletDir)
  )
    throw new Error('A valid wallet folder is required');
  const dir = await fs.stat(walletDir);
  if (!dir.isDirectory()) throw new Error('Wallet folder must be a directory');
  const pem = await fs.stat(path.join(walletDir, 'ewallet.pem'));
  const tns = await fs.stat(path.join(walletDir, 'tnsnames.ora'));
  if (!pem.isFile() || !tns.isFile())
    throw new Error('Wallet must contain ewallet.pem and tnsnames.ora');
  if (tns.size > 1024 * 1024) throw new Error('tnsnames.ora is too large');
  return parseOracleWalletAliases(
    await fs.readFile(path.join(walletDir, 'tnsnames.ora'), 'utf8'),
  );
}

export async function openOracleConnection(
  conn: OracleConnection,
  secrets: OracleSecrets,
  { connectTimeout = 10 } = {},
): Promise<Connection> {
  let connection: Connection | undefined;
  try {
    const invalid = validateOracleConnection(conn);
    if (invalid) throw new Error(invalid);
    if (conn.connectMode === 'wallet') {
      const aliases = await listOracleWalletAliases(conn.walletDir!);
      if (
        !aliases.some(
          (alias) => alias.toUpperCase() === conn.connectString?.toUpperCase(),
        )
      )
        throw new Error('TNS alias was not found in this wallet');
    }
    const driver = await loadOracleDriver();
    connection = await driver.getConnection({
      user: conn.username,
      password: secrets.password,
      connectString:
        conn.connectMode === 'basic'
          ? buildOracleEasyConnect(conn)
          : conn.connectString,
      connectTimeout,
      transportConnectTimeout: connectTimeout,
      sslServerDNMatch: true,
      ...(conn.connectMode === 'wallet'
        ? {
            configDir: conn.walletDir,
            walletLocation: conn.walletDir,
            walletPassword: secrets.walletPassword,
          }
        : {}),
    });
    if (connection.thin !== true || driver.thin !== true)
      throw new Error('Oracle Thin mode is required');
    connection.callTimeout = 600_000;
    await connection.execute(
      "ALTER SESSION SET NLS_DATE_FORMAT='YYYY-MM-DD HH24:MI:SS' NLS_TIMESTAMP_FORMAT='YYYY-MM-DD HH24:MI:SS.FF' NLS_TIMESTAMP_TZ_FORMAT='YYYY-MM-DD HH24:MI:SS.FF TZH:TZM'",
    );
    const schema = conn.schema || normalizeOracleIdentifier(conn.username);
    const identifier = schema.startsWith('"')
      ? normalizeOracleIdentifier(schema)
      : schema;
    await connection.execute(
      `ALTER SESSION SET CURRENT_SCHEMA = "${identifier.replace(/"/g, '""')}"`,
    );
    return connection;
  } catch (error) {
    await connection?.close().catch(() => undefined);
    throw new Error(
      scrubOracleSecrets(
        error instanceof Error ? error.message : String(error),
        [secrets.password, secrets.walletPassword],
      ),
    );
  }
}

const MAX_VALUE_BYTES = 64 * 1024;
const OMITTED = '… [truncated]';
export function normalizeOracleStatement(sql: string): string {
  const trimmed = sql.trim();
  return isOraclePlSql(trimmed)
    ? trimmed.replace(/(?:^|\n)\s*\/\s*$/, '').trim()
    : trimmed.replace(/;\s*$/, '').trim();
}

export function oracleErrorMessage(
  error: unknown,
  secrets: OracleSecrets,
): string {
  const message = scrubOracleSecrets(
    error instanceof Error ? error.message : String(error),
    [secrets.password, secrets.walletPassword],
  );
  if (/NJS-138/.test(message))
    return 'Oracle Database 12.1 or later is required (server reports an unsupported version)';
  if (/ORA-01013/.test(message)) return 'Query cancelled';
  if (/NJS-123|DPI-1067/.test(message))
    return 'Query stopped after the 10-minute Oracle time limit';
  return message;
}

export async function testOracleConnection(
  conn: OracleConnection,
  secrets: OracleSecrets,
): Promise<{ success: true; database: string }> {
  let connection: Connection | undefined;
  try {
    connection = await openOracleConnection(conn, secrets);
    const version = connection.oracleServerVersionString;
    if (!isSupportedOracleVersion(version))
      throw new Error(
        `Oracle Database 12.1 or later is required (server reports ${version})`,
      );
    await connection.execute('SELECT 1 FROM DUAL');
    const driver = await loadOracleDriver();
    const result = await connection.execute<{ DB_NAME: string }>(
      "SELECT SYS_CONTEXT('USERENV','DB_NAME') AS DB_NAME FROM DUAL",
      [],
      { outFormat: driver.OUT_FORMAT_OBJECT },
    );
    return { success: true, database: result.rows?.[0]?.DB_NAME || '' };
  } catch (error) {
    throw new Error(oracleErrorMessage(error, secrets));
  } finally {
    await connection?.close().catch(() => undefined);
  }
}

function boundText(text: string): string {
  const bytes = Buffer.from(text);
  if (bytes.length <= MAX_VALUE_BYTES) return text;
  // UTF-8 decode can end in a partial code point; remove its replacement char.
  return (
    bytes
      .subarray(0, MAX_VALUE_BYTES)
      .toString('utf8')
      .replace(/\uFFFD$/, '') + OMITTED
  );
}

function serializeOracleValue(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (ArrayBuffer.isView(value))
    return Array.from(value as unknown as ArrayLike<number>);
  return value;
}

export async function mapOracleValue(
  value: unknown,
  metadata: Pick<Metadata<never>, 'dbType' | 'dbTypeName'>,
  driver: Awaited<ReturnType<typeof loadOracleDriver>>,
): Promise<unknown> {
  if (value == null) return null;
  const type = metadata.dbType;
  const binary = [
    driver.DB_TYPE_BLOB,
    driver.DB_TYPE_BFILE,
    driver.DB_TYPE_LONG_RAW,
  ].some((item) => item === type);
  if (typeof value === 'object' && 'getData' in value) {
    const lob = value as Lob;
    try {
      if (binary) return `<BLOB ${lob.length} bytes>`;
      const text = String(await lob.getData(1, MAX_VALUE_BYTES));
      const bounded = boundText(text);
      return lob.length > MAX_VALUE_BYTES && !bounded.endsWith(OMITTED)
        ? bounded + OMITTED
        : bounded;
    } finally {
      await lob.close();
    }
  }
  if (Buffer.isBuffer(value))
    return binary ? `<BLOB ${value.length} bytes>` : value.toString('hex');
  if (type === driver.DB_TYPE_OBJECT)
    return `<OBJECT ${metadata.dbTypeName || 'unknown'}>`;
  if (type === driver.DB_TYPE_JSON)
    return boundText(JSON.stringify(value, serializeOracleValue));
  if (
    type === driver.DB_TYPE_INTERVAL_DS ||
    type === driver.DB_TYPE_INTERVAL_YM
  ) {
    if (typeof value !== 'object') return String(value);
    const parts = value as Record<string, number>;
    const sign = Object.values(parts).some((part) => part < 0) ? '-' : '+';
    const unit = (key: string, width = 2) =>
      String(Math.abs(parts[key] || 0)).padStart(width, '0');
    return type === driver.DB_TYPE_INTERVAL_YM
      ? `${sign}${unit('years', 1)}-${unit('months')}`
      : `${sign}${unit('days', 1)} ${unit('hours')}:${unit('minutes')}:${unit('seconds')}.${unit('fseconds', 9)}`;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && !Number.isFinite(value))
    return String(value);
  if (typeof value === 'object')
    return boundText(JSON.stringify(value, serializeOracleValue));
  return typeof value === 'string' ? boundText(value) : value;
}

export async function executeOracleQuery(
  conn: OracleConnection,
  sql: string,
  secrets: OracleSecrets,
  registerCancel?: (cancel: () => void) => void,
): Promise<QueryResponseType> {
  let connection: Connection | undefined;
  let resultSet: ResultSet<Record<string, unknown>> | undefined;
  let cancelled = false;
  let breaking: Promise<void> | undefined;
  try {
    connection = await openOracleConnection(conn, secrets);
    const driver = await loadOracleDriver();
    registerCancel?.(() => {
      cancelled = true;
      breaking = connection!.break().catch(() => undefined);
    });
    const statement = normalizeOracleStatement(sql);
    const result = await connection.execute<Record<string, unknown>>(
      statement,
      [],
      {
        autoCommit: true,
        resultSet: true,
        outFormat: driver.OUT_FORMAT_OBJECT,
        fetchTypeHandler: (meta) => {
          if (
            meta.dbType === driver.DB_TYPE_NUMBER &&
            !(meta.precision! >= 1 && meta.precision! <= 15 && meta.scale === 0)
          )
            return { type: driver.DB_TYPE_VARCHAR };
          if (
            [
              driver.DB_TYPE_DATE,
              driver.DB_TYPE_TIMESTAMP,
              driver.DB_TYPE_TIMESTAMP_TZ,
              driver.DB_TYPE_TIMESTAMP_LTZ,
            ].some((item) => item === meta.dbType)
          )
            return { type: driver.DB_TYPE_VARCHAR };
          return undefined;
        },
      },
    );
    resultSet = result.resultSet;
    if (result.metaData) {
      const rows = resultSet ? await resultSet.getRows() : result.rows || [];
      const data: Record<string, unknown>[] = [];
      for (const row of rows) {
        const mapped: Record<string, unknown> = {};
        for (const meta of result.metaData) {
          Object.defineProperty(mapped, meta.name, {
            value: await mapOracleValue(row[meta.name], meta, driver),
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        data.push(mapped);
      }
      if (cancelled) return { success: false, error: 'Query cancelled' };
      return {
        success: true,
        data: data as unknown as QueryResponseType['data'],
        rowCount: data.length,
        fields: result.metaData.map((meta) => ({
          name: meta.name,
          type:
            typeof meta.dbType === 'number'
              ? meta.dbType
              : meta.dbType?.num || 0,
        })),
      };
    }
    if (cancelled) return { success: false, error: 'Query cancelled' };
    let commandType = 'DDL';
    if (isOraclePlSql(statement)) commandType = 'PLSQL';
    else if (result.rowsAffected !== undefined) commandType = 'DML';
    return {
      success: true,
      isCommand: true,
      commandType,
      rowCount: result.rowsAffected || 0,
    };
  } catch (error) {
    return {
      success: false,
      error: cancelled ? 'Query cancelled' : oracleErrorMessage(error, secrets),
    };
  } finally {
    await breaking;
    await resultSet?.close().catch(() => undefined);
    await connection?.close().catch(() => undefined);
  }
}
/** Oracle-only SQL builders; callers validate and cap pagination inputs. */
export function removeTrailingPagination(query: string): string {
  return query
    .trim()
    .replace(/;$/, '')
    .trim()
    .replace(/\bLIMIT\s+\d+(?:\s+OFFSET\s+\d+)?\s*$/i, '')
    .trim()
    .replace(
      /(?:\bOFFSET\s+\d+\s+ROWS\s*)?\bFETCH\s+(?:FIRST|NEXT)\s+\d+\s+ROWS\s+ONLY\s*$/i,
      '',
    )
    .replace(/\bOFFSET\s+\d+\s+ROWS\s*$/i, '')
    .trim();
}

export function buildPagedQuery(
  baseSql: string,
  orderBy: string,
  limit: number,
  offset: number,
): string {
  return `SELECT * FROM (${baseSql.trim().replace(/;$/, '')}) studio_page${orderBy ? ` ${orderBy}` : ''} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
}

export function buildCountQuery(baseSql: string): string {
  return `SELECT COUNT(*) AS "count" FROM (${baseSql.trim().replace(/;$/, '')}) studio_page`;
}

export function normalizeCount(value: unknown): number | undefined {
  return value == null ? undefined : Number(value);
}
