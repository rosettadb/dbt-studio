/* eslint-disable no-restricted-syntax, no-await-in-loop */
import type { Connection } from 'oracledb';
import type { Column, OracleConnection, Table } from '../../types/backend';
import {
  openOracleConnection,
  OracleSecrets,
  loadOracleDriver,
  oracleErrorMessage,
} from '../utils/oracleHelper';
import { normalizeOracleIdentifier } from '../../shared/oracle';

export const ORACLE_MAX_TABLES = 20_000;
const ORACLE_METADATA_BATCH_SIZE = 500;
type Row = Record<string, any>;

function catalogKey(...identifiers: string[]): string {
  return JSON.stringify(identifiers);
}

function formatColumnType(col: Row): string {
  if (col.DATA_TYPE === 'NUMBER' && col.DATA_PRECISION != null)
    return `NUMBER(${col.DATA_PRECISION},${col.DATA_SCALE || 0})`;
  if (col.CHAR_LENGTH && /CHAR/.test(col.DATA_TYPE))
    return `${col.DATA_TYPE}(${col.CHAR_LENGTH} ${col.CHAR_USED === 'C' ? 'CHAR' : 'BYTE'})`;
  return col.DATA_TYPE;
}

export default class OracleExtractor {
  private connection?: Connection;

  private readonly config: OracleConnection;

  private readonly secrets: OracleSecrets;

  constructor(config: OracleConnection, secrets: OracleSecrets) {
    this.config = config;
    this.secrets = secrets;
  }

  async connect(): Promise<void> {
    this.connection = await openOracleConnection(this.config, this.secrets);
  }

  async disconnect(): Promise<void> {
    const { connection } = this;
    this.connection = undefined;
    await connection?.close();
  }

  private async rows(
    sql: string,
    binds: Record<string, string | number> = {},
  ): Promise<Row[]> {
    const driver = await loadOracleDriver();
    const result = await this.connection!.execute<Row>(sql, binds, {
      outFormat: driver.OUT_FORMAT_OBJECT,
      fetchArraySize: 1000,
    });
    return result.rows || [];
  }

  async extractSchema(): Promise<{ tables: Table[] }> {
    try {
      const current =
        this.config.schema || normalizeOracleIdentifier(this.config.username);
      // Read accessible objects once instead of issuing queries for every owner.
      const objects = await this.rows(
        `SELECT * FROM (SELECT * FROM (
          SELECT t.OWNER, t.TABLE_NAME AS NAME, 'TABLE' AS KIND
          FROM ALL_TABLES t JOIN ALL_USERS u ON u.USERNAME = t.OWNER
          WHERE (u.ORACLE_MAINTAINED = 'N' OR t.OWNER = :owner)
            AND t.NESTED = 'NO' AND t.SECONDARY = 'N' AND (t.IOT_TYPE IS NULL OR t.IOT_TYPE = 'IOT')
            AND t.TABLE_NAME NOT LIKE 'BIN$%'
            AND NOT EXISTS (SELECT 1 FROM ALL_MVIEWS m WHERE m.OWNER = t.OWNER AND m.MVIEW_NAME = t.TABLE_NAME)
          UNION ALL
          SELECT v.OWNER, v.VIEW_NAME AS NAME, 'VIEW' AS KIND
          FROM ALL_VIEWS v JOIN ALL_USERS u ON u.USERNAME = v.OWNER
          WHERE (u.ORACLE_MAINTAINED = 'N' OR v.OWNER = :owner) AND v.VIEW_NAME NOT LIKE 'BIN$%'
          UNION ALL
          SELECT m.OWNER, m.MVIEW_NAME AS NAME, 'MATERIALIZED VIEW' AS KIND
          FROM ALL_MVIEWS m JOIN ALL_USERS u ON u.USERNAME = m.OWNER
          WHERE (u.ORACLE_MAINTAINED = 'N' OR m.OWNER = :owner) AND m.MVIEW_NAME NOT LIKE 'BIN$%'
        ) ORDER BY CASE WHEN OWNER = :owner THEN 0 ELSE 1 END, OWNER, NAME)
        WHERE ROWNUM <= :cap`,
        { owner: current, cap: ORACLE_MAX_TABLES + 1 },
      );
      const selected = objects.slice(0, ORACLE_MAX_TABLES);
      const tables: Table[] = [];
      for (
        let start = 0;
        start < selected.length;
        start += ORACLE_METADATA_BATCH_SIZE
      ) {
        const group = selected.slice(start, start + ORACLE_METADATA_BATCH_SIZE);
        const binds: Record<string, string> = {};
        group.forEach((row, index) => {
          binds[`o${index}`] = row.OWNER;
          binds[`t${index}`] = row.NAME;
        });
        const pairs = group
          .map((_row, index) => `(:o${index}, :t${index})`)
          .join(',');
        // Joining these dictionary views together makes shared catalogs very slow.
        // Fetch each separately, binding exact owner/table pairs in bounded batches.
        const columns = await this.rows(
          `SELECT c.OWNER, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE,
            c.DATA_PRECISION, c.DATA_SCALE, c.CHAR_LENGTH, c.CHAR_USED, c.COLUMN_ID, c.NULLABLE
          FROM ALL_TAB_COLUMNS c WHERE (c.OWNER, c.TABLE_NAME) IN (${pairs})
          ORDER BY c.OWNER, c.TABLE_NAME, c.COLUMN_ID`,
          binds,
        );
        const primaryKeys = await this.rows(
          `SELECT cc.OWNER, cc.TABLE_NAME, cc.COLUMN_NAME, cc.POSITION
          FROM ALL_CONS_COLUMNS cc JOIN ALL_CONSTRAINTS p
            ON p.OWNER = cc.OWNER AND p.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
          WHERE p.CONSTRAINT_TYPE = 'P' AND (cc.OWNER, cc.TABLE_NAME) IN (${pairs})`,
          binds,
        );
        const positions = new Map(
          primaryKeys.map((col) => [
            catalogKey(col.OWNER, col.TABLE_NAME, col.COLUMN_NAME),
            col.POSITION,
          ]),
        );
        const columnsByTable = new Map<string, Column[]>();
        for (const col of columns) {
          const key = catalogKey(col.OWNER, col.TABLE_NAME);
          const position =
            positions.get(
              catalogKey(col.OWNER, col.TABLE_NAME, col.COLUMN_NAME),
            ) || 0;
          const tableColumns = columnsByTable.get(key) || [];
          tableColumns.push({
            name: col.COLUMN_NAME,
            typeName: formatColumnType(col),
            ordinalPosition: col.COLUMN_ID,
            primaryKeySequenceId: position,
            columnDisplaySize: col.CHAR_LENGTH || col.DATA_PRECISION || 0,
            precision: col.DATA_PRECISION || 0,
            scale: col.DATA_SCALE || 0,
            columnProperties: [],
            autoincrement: false,
            primaryKey: !!position,
            nullable: col.NULLABLE === 'Y',
          });
          columnsByTable.set(key, tableColumns);
        }
        for (const object of group) {
          tables.push({
            name: object.NAME,
            type: object.KIND,
            schema: object.OWNER,
            columns:
              columnsByTable.get(catalogKey(object.OWNER, object.NAME)) || [],
          });
        }
      }
      return { tables };
    } catch (error) {
      throw new Error(oracleErrorMessage(error, this.secrets));
    } finally {
      await this.disconnect();
    }
  }
}
