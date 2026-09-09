import { ConnectionModel } from '../../types/backend';

/**
 * Validates connection name for uniqueness and reserved names
 * @param name The connection name to validate
 * @param existingConnections Array of existing connections
 * @param excludeId ID to exclude from uniqueness check (for updates)
 * @param allowReservedNames Whether to allow reserved names (for Getting Started template)
 * @returns Validation result with isValid flag and optional message
 */
export const validateConnectionName = (
  name: string,
  existingConnections: ConnectionModel[],
  excludeId?: string,
  allowReservedNames?: boolean,
): { isValid: boolean; message?: string } => {
  // Check for empty name
  if (!name.trim()) {
    return {
      isValid: false,
      message: 'Connection name cannot be empty',
    };
  }

  // Check for reserved names (case-insensitive) - skip if allowed
  if (!allowReservedNames && name.toLowerCase().trim() === 'dbt connection') {
    return {
      isValid: false,
      message:
        'Connection name "DBT Connection" is reserved for the getting started template',
    };
  }

  // Check for uniqueness (case-insensitive)
  const duplicateExists = existingConnections.some(
    (conn) =>
      conn.connection.name.toLowerCase().trim() === name.toLowerCase().trim() &&
      conn.id !== excludeId,
  );

  if (duplicateExists) {
    return {
      isValid: false,
      message: 'A connection with this name already exists',
    };
  }

  return { isValid: true };
};

/**
 * Real-time validation hook for connection name fields
 */
export const useConnectionNameValidation = (
  existingConnections: ConnectionModel[],
  excludeId?: string,
) => {
  const validateName = (name: string) => {
    return validateConnectionName(name, existingConnections, excludeId);
  };

  return { validateName };
};

/**
 * Validates a BigQuery dataset name against BigQuery's own naming rules:
 * letters, numbers, and underscores only, up to 1024 characters.
 */
export const validateBigQueryDatasetName = (
  dataset: string,
): { isValid: boolean; message?: string } => {
  if (!dataset.trim()) {
    return { isValid: false, message: 'Dataset cannot be empty' };
  }

  if (dataset.length > 1024) {
    return {
      isValid: false,
      message: 'Dataset name must be 1024 characters or fewer',
    };
  }

  if (!/^[A-Za-z0-9_]+$/.test(dataset)) {
    return {
      isValid: false,
      message:
        'Dataset name can only contain letters, numbers, and underscores',
    };
  }

  return { isValid: true };
};
