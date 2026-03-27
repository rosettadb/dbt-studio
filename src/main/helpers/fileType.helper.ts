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
 */
export async function getReaderFunction(
  connection: any,
  filePath: string,
): Promise<string> {
  const extension = filePath.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'csv': {
      // For CSV files, we need to detect if headers are present
      const hasHeaders = await detectCsvHeaders(connection, filePath);
      return `read_csv_auto('${filePath}', header=${hasHeaders}, ignore_errors=true, null_padding=true, nullstr='?')`;
    }
    case 'json':
    case 'jsonl':
      return `read_json_auto('${filePath}')`;
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
