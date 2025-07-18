import type { CloudProvider, PreviewResult } from '../../types/frontend';

/**
 * Error Handling Helper
 * Contains provider-specific error handling logic
 */

/**
 * Handle provider-specific errors and return appropriate error messages
 */
export function handleProviderError(
  provider: CloudProvider,
  errorMessage: string,
  objectPath: string,
  previewType: 'sample' | 'schema' | 'stats',
): PreviewResult {
  // Handle GCS authentication errors
  if (provider === 'gcs' && errorMessage.includes('HTTP 403')) {
    return {
      success: false,
      error: `GCS Authentication Error: Access denied to the file.\n\nThis file appears to be private. To preview private GCS files, you need:\n1. Make the file publicly accessible, or\n2. Use a signed URL, or\n3. Configure proper service account permissions\n\nCurrent URL: ${objectPath}`,
      objectPath,
      previewType,
    };
  }

  // Handle other HTTP errors for GCS
  if (provider === 'gcs' && errorMessage.includes('HTTP Error')) {
    return {
      success: false,
      error: `GCS Access Error: ${errorMessage}\n\nThis might be due to:\n1. File doesn't exist\n2. Network connectivity issues\n3. Authentication problems\n4. File is private and requires signed URL`,
      objectPath,
      previewType,
    };
  }

  // Handle Azure authentication errors
  if (
    provider === 'azure' &&
    errorMessage.includes('AzureBlobStorageFileSystem')
  ) {
    return {
      success: false,
      error: `Azure Authentication Error: ${errorMessage}\n\nThis might be due to:\n1. Invalid account name or key\n2. Incorrect connection string format\n3. Network connectivity issues\n4. File doesn't exist in the specified container\n5. Container access permissions\n\nCurrent URL: ${objectPath}`,
      objectPath,
      previewType,
    };
  }

  // Handle extension-specific errors
  if (errorMessage.includes('No extension found')) {
    const fileExtension = objectPath.split('.').pop()?.toLowerCase();
    let suggestion = '';

    switch (fileExtension) {
      case 'avro':
        suggestion =
          'Avro files require the avro extension. Please ensure it is installed and loaded.';
        break;
      case 'json':
      case 'jsonl':
        suggestion =
          'JSON files require the json extension. Please ensure it is installed and loaded.';
        break;
      case 'xlsx':
      case 'xls':
        suggestion =
          'Excel files require the excel extension. Please ensure it is installed and loaded.';
        break;
      default:
        suggestion =
          'This file format may not be supported or requires a specific extension.';
    }

    return {
      success: false,
      error: `${errorMessage}\n\nSuggestion: ${suggestion}`,
      objectPath,
      previewType,
    };
  }

  // Generic error
  return {
    success: false,
    error: errorMessage,
    objectPath,
    previewType,
  };
}
