/**
 * Utility functions for file operations and formatting
 */

/**
 * Format file size from bytes to human readable format
 * @param bytes - File size in bytes (can be undefined, null, or 0)
 * @param options - Formatting options
 * @param options.showZeroAsNA - Whether to show 0 bytes as 'N/A' (default: true)
 * @param options.precision - Number of decimal places (default: 2)
 * @returns Formatted file size string (e.g., "2.5 MB", "1.2 GB")
 */
export const formatFileSize = (
  bytes: number | undefined | null,
  options: { showZeroAsNA?: boolean; precision?: number } = {},
): string => {
  const { showZeroAsNA = true, precision = 2 } = options;

  // Handle null, undefined, or non-numeric values
  if (bytes == null || Number.isNaN(bytes) || bytes < 0) {
    return 'N/A';
  }

  // Handle zero bytes
  if (bytes === 0) {
    return showZeroAsNA ? 'N/A' : '0 Bytes';
  }

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Prevent index out of bounds
  const sizeIndex = Math.min(i, sizes.length - 1);
  const value = bytes / k ** sizeIndex;

  // For bytes, don't show decimal places
  if (sizeIndex === 0) {
    return `${Math.round(value)} ${sizes[sizeIndex]}`;
  }

  return `${parseFloat(value.toFixed(precision))} ${sizes[sizeIndex]}`;
};

/**
 * Format file size for different use cases with predefined options
 */
export const formatFileSizeVariants = {
  /** Standard format: Shows 'N/A' for zero/null bytes */
  standard: (bytes: number | undefined | null) => formatFileSize(bytes),

  /** Detailed format: Shows '0 Bytes' for zero bytes instead of 'N/A' */
  detailed: (bytes: number | undefined | null) =>
    formatFileSize(bytes, { showZeroAsNA: false }),

  /** Compact format: Uses 1 decimal place for smaller numbers */
  compact: (bytes: number | undefined | null) =>
    formatFileSize(bytes, { precision: 1 }),

  /** Precise format: Uses 3 decimal places for more precision */
  precise: (bytes: number | undefined | null) =>
    formatFileSize(bytes, { precision: 3 }),
};

/**
 * Get file extension from filename
 * @param fileName - The file name
 * @returns File extension in lowercase (e.g., "pdf", "jpg")
 */
export const getFileExtension = (fileName: string): string => {
  return fileName.split('.').pop()?.toLowerCase() || '';
};

/**
 * Check if a file type is supported for preview
 * @param fileName - The file name
 * @returns True if the file type supports preview
 */
export const isPreviewSupported = (fileName: string): boolean => {
  const extension = getFileExtension(fileName);
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
  return supportedTypes.includes(extension);
};

/**
 * Get human-readable file type description
 * @param fileName - The file name
 * @returns Human-readable file type description
 */
export const getFileTypeDescription = (fileName: string): string => {
  const extension = getFileExtension(fileName);

  const typeMap: Record<string, string> = {
    parquet: 'Apache Parquet',
    csv: 'Comma-Separated Values',
    json: 'JSON Document',
    jsonl: 'JSON Lines',
    xlsx: 'Excel Spreadsheet',
    xls: 'Excel Spreadsheet (Legacy)',
    sqlite: 'SQLite Database',
    db: 'Database File',
    arrow: 'Apache Arrow',
    avro: 'Apache Avro',
    delta: 'Delta Lake',
    iceberg: 'Apache Iceberg',
    txt: 'Text File',
    md: 'Markdown Document',
    xml: 'XML Document',
    pdf: 'PDF Document',
    jpg: 'JPEG Image',
    jpeg: 'JPEG Image',
    png: 'PNG Image',
    gif: 'GIF Image',
    svg: 'SVG Image',
    webp: 'WebP Image',
  };

  return typeMap[extension] || `${extension.toUpperCase()} File`;
};
