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
  options?: {
    allowIgnoreErrors?: boolean;
    nullString?: string;
  },
): Promise<string> {
  const extension = filePath.split('.').pop()?.toLowerCase();
  const escapedFilePath = filePath.replace(/'/g, "''");

  switch (extension) {
    case 'csv': {
      // For CSV files, we need to detect if headers are present
      const hasHeaders = await detectCsvHeaders(connection, filePath);

      const params: string[] = [
        `'${escapedFilePath}'`,
        `header=${hasHeaders}`,
        'null_padding=true',
      ];

      if (options?.allowIgnoreErrors) {
        // eslint-disable-next-line no-console
        console.warn(
          '[getReaderFunction] CSV parsing: allowIgnoreErrors enabled; malformed rows may be skipped.',
        );
        params.push('ignore_errors=true');
      }

      if (options?.nullString) {
        params.push(`nullstr='${options.nullString.replace(/'/g, "''")}'`);
      }

      return `read_csv_auto(${params.join(', ')})`;
    }
    case 'json':
    case 'jsonl':
      return `read_json_auto('${escapedFilePath}')`;
    case 'avro':
      return `read_avro('${escapedFilePath}')`;
    case 'parquet':
      return `read_parquet('${escapedFilePath}')`;
    case 'xlsx':
    case 'xls':
      return `read_excel('${escapedFilePath}')`;
    default:
      // For other formats, try direct access first
      return `'${escapedFilePath}'`;
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
