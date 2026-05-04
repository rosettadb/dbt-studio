import DuckDBBootstrap from './duckdb.service';
import type {
  PreviewResult,
  PreviewOptions,
  ColumnStat,
} from '../../types/frontend';
import {
  buildCloudSecretQuery,
  getCloudUrl,
  isPreviewSupported,
  handleProviderError,
  convertDuckDBValue,
} from '../helpers';
import { setupExtensions } from '../helpers/extensionSetup.helper';

// ─── Format Detection ─────────────────────────────────────────────────────────

type DetectedFormat =
  | 'csv'
  | 'json'
  | 'jsonl'
  | 'parquet'
  | 'avro'
  | 'xlsx'
  | 'xls';

const FORBIDDEN_CREDENTIAL_KEYWORDS =
  /\b(SECRET|CREDENTIAL|KEY_ID|SECRET_KEY)\b/i;

type PreviewMetadata = {
  detectedFormat?: DetectedFormat;
  columns?: Array<{ name: string; type: string; nullable?: boolean }>;
  totalRowsByFilter: Map<string, number>;
  columnStats?: ColumnStat[];
};

const metadataCache = new Map<string, PreviewMetadata>();

function getMetadataCacheEntry(objectPath: string): PreviewMetadata {
  const existing = metadataCache.get(objectPath);
  if (existing) return existing;

  const entry: PreviewMetadata = {
    totalRowsByFilter: new Map<string, number>(),
  };
  metadataCache.set(objectPath, entry);
  return entry;
}

function getFilterCacheKey(whereClause: string): string {
  return whereClause.trim();
}

function validateWhereClause(whereClause: string): void {
  if (FORBIDDEN_CREDENTIAL_KEYWORDS.test(whereClause)) {
    throw new Error('WHERE clause contains forbidden keywords');
  }
}

function detectFormatFromExtension(objectPath: string): DetectedFormat | null {
  const ext = objectPath.split('.').pop()?.toLowerCase();
  if (!ext) return null;
  if (['parquet', 'pq', 'parq'].includes(ext)) return 'parquet';
  if (ext === 'csv') return 'csv';
  if (ext === 'jsonl') return 'jsonl';
  if (ext === 'json') return 'json';
  if (ext === 'avro') return 'avro';
  if (ext === 'xlsx') return 'xlsx';
  if (ext === 'xls') return 'xls';
  return null;
}

async function detectFormatFromBytes(
  connection: any,
  objectPath: string,
): Promise<DetectedFormat | null> {
  try {
    const escaped = objectPath.replace(/'/g, "''");
    const result = await connection.run(
      `SELECT read_blob('${escaped}')[1:4] AS magic`,
    );
    const rows = await result.getRows();
    if (!rows.length) return null;
    const magic = rows[0][0];
    if (!magic) return null;
    const bytes =
      typeof magic === 'string' ? magic : Buffer.from(magic).toString('binary');
    if (bytes.startsWith('PAR1')) return 'parquet';
    if (bytes.startsWith('Obj\x01')) return 'avro'; // Avro magic bytes
    if (bytes.startsWith('{') || bytes.startsWith('[')) return 'json';
    return 'csv';
  } catch {
    return null;
  }
}

function getReaderFnForFormat(
  format: DetectedFormat,
  objectPath: string,
): string {
  const escaped = objectPath.replace(/'/g, "''");
  switch (format) {
    case 'parquet':
      return `read_parquet('${escaped}')`;
    case 'json':
    case 'jsonl':
      return `read_json_auto('${escaped}', sample_size=200)`;
    case 'avro':
      return `read_avro('${escaped}')`;
    case 'xlsx':
    case 'xls':
      return `read_excel('${escaped}')`;
    default:
      return `read_csv_auto('${escaped}', sample_size=200, auto_detect=true)`;
  }
}

// ─── Row Counting ─────────────────────────────────────────────────────────────

async function getTotalRows(
  connection: any,
  readerFn: string,
  format: DetectedFormat,
  objectPath: string,
  whereClause: string,
): Promise<number> {
  // Parquet: exact count from footer metadata when no filter is active.
  if (format === 'parquet' && !whereClause) {
    try {
      const escaped = objectPath.replace(/'/g, "''");
      const result = await connection.run(
        `SELECT SUM(num_rows) AS total FROM parquet_file_metadata('${escaped}')`,
      );
      const rows = await result.getRows();
      const total = rows[0]?.[0];
      if (total !== null && total !== undefined) {
        return Number(total);
      }
    } catch {
      // fall through to COUNT(*)
    }
  }

  // All other formats, and filtered Parquet previews: exact COUNT(*) scan.
  // DuckDB caches remote file metadata via enable_http_metadata_cache,
  // so repeated COUNT(*) calls on the same file are fast.
  const whereClauseSql = whereClause ? `WHERE ${whereClause}` : '';
  const countResult = await connection.run(
    `SELECT COUNT(*) AS cnt FROM ${readerFn} ${whereClauseSql}`,
  );
  const countRows = await countResult.getRows();
  return Number(countRows[0]?.[0] || 0);
}

// ─── Column Statistics ────────────────────────────────────────────────────────

async function computeColumnStats(
  connection: any,
  readerFn: string,
  columns: Array<{ name: string; type: string }>,
): Promise<ColumnStat[]> {
  return Promise.all(
    columns.map(async (col): Promise<ColumnStat> => {
      const escapedCol = `"${col.name.replace(/"/g, '""')}"`;
      const isNumeric = /int|float|double|decimal|numeric|real|bigint/i.test(
        col.type,
      );

      try {
        const meanExpr = isNumeric ? `AVG(${escapedCol})::VARCHAR` : `NULL`;
        const query = `
          SELECT
            COUNT(*) - COUNT(${escapedCol}) AS null_count,
            COUNT(DISTINCT ${escapedCol}) AS distinct_count,
            MIN(${escapedCol})::VARCHAR AS min_val,
            MAX(${escapedCol})::VARCHAR AS max_val,
            ${meanExpr} AS mean_val
          FROM (SELECT * FROM ${readerFn} LIMIT 10000)
        `;
        const result = await connection.run(query);
        const rows = await result.getRows();
        const row = rows[0];

        if (row) {
          const getValue = (v: any) =>
            v !== null && v !== undefined
              ? String(convertDuckDBValue(v))
              : null;
          return {
            columnName: col.name,
            columnType: col.type,
            nullCount: row[0] !== null ? Number(row[0]) : null,
            distinctCount: row[1] !== null ? Number(row[1]) : null,
            min: getValue(row[2]),
            max: getValue(row[3]),
            mean: getValue(row[4]),
            isSampleBased: true,
          };
        }
        return {
          columnName: col.name,
          columnType: col.type,
          nullCount: null,
          distinctCount: null,
          min: null,
          max: null,
          mean: null,
          isSampleBased: true,
        };
      } catch {
        return {
          columnName: col.name,
          columnType: col.type,
          nullCount: null,
          distinctCount: null,
          min: null,
          max: null,
          mean: null,
          isSampleBased: true,
        };
      }
    }),
  );
}

// ─── Schema Extraction ────────────────────────────────────────────────────────

/**
 * Formats where DESCRIBE ... LIMIT 0 fails because the reader needs to scan
 * actual rows to infer the schema. For these we use LIMIT 1 instead.
 */
const FORMATS_NEEDING_SAMPLE_FOR_SCHEMA: DetectedFormat[] = [
  'avro',
  'xlsx',
  'xls',
];

async function extractSchemaColumns(
  connection: any,
  readerFn: string,
  format?: DetectedFormat,
): Promise<Array<{ name: string; type: string; nullable?: boolean }>> {
  const limit =
    format && FORMATS_NEEDING_SAMPLE_FOR_SCHEMA.includes(format) ? 1 : 0;

  const describeResult = await connection.run(
    `DESCRIBE SELECT * FROM ${readerFn} LIMIT ${limit}`,
  );
  const describeRows = await describeResult.getRows();

  return describeRows.map((row: any) => {
    if (Array.isArray(row)) {
      return {
        name: String(row[0] ?? 'unknown'),
        type: String(row[1] ?? 'unknown'),
        nullable: row[2] !== 'NO',
      };
    }
    return {
      name: String(row.column_name ?? row.name ?? 'unknown'),
      type: String(row.column_type ?? row.type ?? 'unknown'),
      nullable: row.null !== 'NO',
    };
  });
}

// ─── Connection with timeout ──────────────────────────────────────────────────

const CONNECTION_TIMEOUT_MS = 5000;

async function getConnectionWithTimeout(): Promise<any> {
  return Promise.race([
    DuckDBBootstrap.getConnection('cloud-preview'),
    new Promise<never>((resolve, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            'Connection pool timeout: system is busy, please try again',
          ),
        );
      }, CONNECTION_TIMEOUT_MS);
    }),
  ]);
}

// ─── Secret cleanup ───────────────────────────────────────────────────────────

async function dropSecrets(connection: any): Promise<void> {
  try {
    await connection.run(`
      DROP SECRET IF EXISTS s3_secret;
      DROP SECRET IF EXISTS gcs_secret;
      DROP SECRET IF EXISTS azure_secret;
      DROP SECRET IF EXISTS minio_secret;
      DROP SECRET IF EXISTS r2_secret;
      DROP SECRET IF EXISTS b2_secret;
      DROP SECRET IF EXISTS rustfs_secret;
      DROP SECRET IF EXISTS garage_secret;
    `);
  } catch {
    // Best-effort cleanup — ignore errors
  }
}

// ─── Main Service ─────────────────────────────────────────────────────────────

class CloudPreviewService {
  static async previewCloudData({
    provider,
    cloudConfig,
    objectPath,
    previewType = 'sample',
    limit,
    page = 0,
    pageSize = 25,
    whereClause = '',
    knownTotalRows,
  }: PreviewOptions): Promise<PreviewResult> {
    const effectivePageSize = limit ?? pageSize;
    const startTime = Date.now();
    const metadata = getMetadataCacheEntry(objectPath);
    const filterCacheKey = getFilterCacheKey(whereClause);

    let connection: any = null;
    try {
      connection = await getConnectionWithTimeout();

      // Enable DuckDB's built-in HTTP metadata and object caching.
      // DuckDB handles remote file caching natively — no application-level
      // cache is needed on top of this.
      await connection.run('SET enable_http_metadata_cache = true');
      await connection.run('SET enable_object_cache = true');

      // Install and load required extensions (idempotent)
      await setupExtensions(connection, provider, objectPath);

      // Configure cloud access secrets
      const secretQuery = await buildCloudSecretQuery(provider, cloudConfig);
      await connection.run(secretQuery);

      // Detect format once per object — extension first, then magic bytes.
      const { detectedFormat: cachedDetectedFormat } = metadata;
      let detectedFormat = cachedDetectedFormat;
      if (!detectedFormat) {
        detectedFormat = detectFormatFromExtension(objectPath) ?? undefined;
        if (!detectedFormat) {
          detectedFormat =
            (await detectFormatFromBytes(connection, objectPath)) ?? undefined;
        }
        if (detectedFormat) {
          metadata.detectedFormat = detectedFormat;
        }
      }
      if (!detectedFormat) {
        return {
          success: false,
          error:
            'Unsupported or undetectable file format. Supported: parquet, csv, json, jsonl, avro, xlsx, xls.',
          objectPath,
          previewType,
        };
      }

      // Build reader function
      const readerFn = getReaderFnForFormat(detectedFormat, objectPath);

      // Validate WHERE clause
      if (whereClause) validateWhereClause(whereClause);

      let data: any[] = [];
      let columns: Array<{ name: string; type: string; nullable?: boolean }> =
        [];
      let columnStats: ColumnStat[] | undefined;

      if (previewType === 'schema') {
        columns =
          metadata.columns ??
          (await extractSchemaColumns(connection, readerFn, detectedFormat));
        metadata.columns = columns;
        return {
          success: true,
          data: [],
          columns,
          totalRows: 0,
          objectPath,
          previewType,
          detectedFormat,
          executionTimeMs: Date.now() - startTime,
        };
      }

      if (previewType === 'stats') {
        columns =
          metadata.columns ??
          (await extractSchemaColumns(connection, readerFn, detectedFormat));
        metadata.columns = columns;
        columnStats =
          metadata.columnStats ??
          (await computeColumnStats(connection, readerFn, columns));
        metadata.columnStats = columnStats;
        return {
          success: true,
          data: columnStats as any,
          columns,
          totalRows: 0,
          objectPath,
          previewType,
          detectedFormat,
          executionTimeMs: Date.now() - startTime,
        };
      }

      // Paginated sample query
      const offset = page * effectivePageSize;
      const whereClauseSql = whereClause ? `WHERE ${whereClause}` : '';
      const query = `SELECT * FROM ${readerFn} ${whereClauseSql} LIMIT ${effectivePageSize} OFFSET ${offset}`;

      const result = await connection.run(query);
      const rows = await result.getRows();

      // Extract columns from result schema
      if (result.schema?.fields) {
        columns = result.schema.fields.map((field: any) => ({
          name: field.name,
          type: field.type?.toString() || 'unknown',
        }));
        metadata.columns = columns;
      } else {
        try {
          columns =
            metadata.columns ??
            (await extractSchemaColumns(connection, readerFn, detectedFormat));
          metadata.columns = columns;
        } catch {
          if (rows.length > 0) {
            const firstRow = rows[0];
            if (Array.isArray(firstRow)) {
              columns = firstRow.map((_: any, i: number) => ({
                name: `Column ${i + 1}`,
                type: 'unknown',
              }));
            } else if (typeof firstRow === 'object' && firstRow !== null) {
              columns = Object.keys(firstRow).map((key) => ({
                name: key,
                type: 'unknown',
              }));
            }
          }
        }
      }

      let totalRows =
        page > 0 && Number.isFinite(knownTotalRows)
          ? knownTotalRows
          : undefined;
      if (totalRows === undefined) {
        totalRows = metadata.totalRowsByFilter.get(filterCacheKey);
      }
      if (totalRows === undefined) {
        totalRows = await getTotalRows(
          connection,
          readerFn,
          detectedFormat,
          objectPath,
          whereClause,
        );
        metadata.totalRowsByFilter.set(filterCacheKey, totalRows);
      }
      const isEstimatedCount = false;

      // Convert DuckDB-specific types
      data = rows.map((row: any) => {
        if (Array.isArray(row)) {
          return row.map((cell: any) => convertDuckDBValue(cell));
        }
        if (typeof row === 'object' && row !== null) {
          const convertedRow: any = {};
          Object.keys(row).forEach((key) => {
            convertedRow[key] = convertDuckDBValue(row[key]);
          });
          return convertedRow;
        }
        return convertDuckDBValue(row);
      });

      return {
        success: true,
        data,
        columns,
        totalRows,
        isEstimatedCount,
        page,
        pageSize: effectivePageSize,
        objectPath,
        previewType,
        detectedFormat,
        activeWhereClause: whereClause || undefined,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error in previewCloudData:', error);

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return handleProviderError(
        provider,
        errorMessage,
        objectPath,
        previewType,
      );
    } finally {
      if (connection) {
        await dropSecrets(connection);
        await DuckDBBootstrap.releaseConnection(connection);
      }
    }
  }

  static getCloudUrl = getCloudUrl;

  static isPreviewSupported = isPreviewSupported;
}

export default CloudPreviewService;
