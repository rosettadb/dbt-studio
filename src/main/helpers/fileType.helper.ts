import { detectCsvHeaders } from './csvHeaderDetection.helper';

/**
 * File Type Utilities Helper
 * Contains utilities for file type detection and reader function selection
 */

/**
 * Check if file type is supported for preview
 */
export function isPreviewSupported(fileName: string): boolean {
  const extension = fileName.split('.').pop()?.toLowerCase();
  const supportedTypes = [
    'parquet',
    'csv',
    'json',
    'jsonl',
    'xlsx',
    'xls',
    'sqlite',
    'db',
    'arrow',
    'avro',
    'delta',
    'iceberg',
  ];
  return supportedTypes.includes(extension || '');
}

/**
 * Get the appropriate reader function based on file extension
 * OPTIMIZATION: For CSV files, uses sample_size to limit type inference scanning
 *
 * @param connection - DuckDB connection
 * @param filePath - Path to the file (local or cloud URL)
 * @param sampleSize - Number of rows to sample for type inference (default: 2048)
 */
export async function getReaderFunction(
  connection: any,
  filePath: string,
  sampleSize: number = 2048,
  // New parameter to control if we want strict header detection
  // For preview purposes, we can often skip strict checks to be faster
  detectHeaders: boolean = false,
): Promise<string> {
  const extension = filePath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'csv': {
      // OPTIMIZATION: Skip manual header detection by default (> 15s savings)
      // Trust DuckDB's auto_detect=true with a limited sample_size
      let hasHeadersString = 'true'; // Default to assuming headers

      if (detectHeaders) {
        // Only pay the cost of manual detection if explicitly requested
        const hasHeaders = await detectCsvHeaders(connection, filePath);
        hasHeadersString = hasHeaders.toString();
      }

      // Use sample_size to limit scanning.
      // Note: We intentionally use a smaller sample size if detectHeaders is false
      // to ensure the preview returns as fast as possible.
      const effectiveSampleSize = detectHeaders
        ? sampleSize
        : Math.min(sampleSize, 200);

      return `read_csv_auto('${filePath}', header=${hasHeadersString}, sample_size=${effectiveSampleSize})`;
    }
    case 'json':
    case 'jsonl':
      return `read_json_auto('${filePath}', sample_size=${sampleSize})`;
    case 'avro':
      return `read_avro('${filePath}')`;
    case 'parquet':
      return `read_parquet('${filePath}')`;
    case 'xlsx':
    case 'xls':
      return `read_excel('${filePath}')`;
    default:
      // For other formats, try direct access first
      return `'${filePath}'`;
  }
}

/**
 * Get extension map for DuckDB extensions
 */
export function getExtensionMap(): { [key: string]: string } {
  return {
    avro: 'avro',
    json: 'json',
    jsonl: 'json',
    xlsx: 'excel',
    xls: 'excel',
    parquet: 'parquet', // Usually built-in
    csv: 'csv', // Usually built-in
  };
}
