/**
 * Data Conversion Helper
 * Contains utilities for converting DuckDB types to JavaScript types
 */

/**
 * Convert DuckDB-specific types to regular JavaScript values
 */
export function convertDuckDBValue(value: any): any {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return value;
  }

  // Convert BigInt to regular number
  if (typeof value === 'bigint') {
    return Number(value);
  }

  // Convert DuckDB timestamp values
  if (value && typeof value === 'object' && 'micros' in value) {
    const timestamp = new Date(Number(value.micros) / 1000);
    return timestamp.toISOString();
  }

  // Convert DuckDB date values
  if (value && typeof value === 'object' && 'days' in value) {
    const date = new Date(Number(value.days) * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  // Convert DuckDB time values
  if (
    value &&
    typeof value === 'object' &&
    'micros' in value &&
    'days' in value
  ) {
    const timestamp = new Date(Number(value.micros) / 1000);
    return timestamp.toISOString();
  }

  // Convert arrays recursively
  if (Array.isArray(value)) {
    return value.map((item) => convertDuckDBValue(item));
  }

  // Convert objects recursively
  if (typeof value === 'object') {
    const converted: any = {};
    Object.keys(value).forEach((key) => {
      converted[key] = convertDuckDBValue(value[key]);
    });
    return converted;
  }

  return value;
}
