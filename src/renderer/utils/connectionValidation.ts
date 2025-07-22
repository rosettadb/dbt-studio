import { ConnectionModel } from '../../types/backend';

/**
 * Validates connection name for uniqueness and reserved names
 * @param name The connection name to validate
 * @param existingConnections Array of existing connections
 * @param excludeId ID to exclude from uniqueness check (for updates)
 * @returns Validation result with isValid flag and optional message
 */
export const validateConnectionName = (
  name: string,
  existingConnections: ConnectionModel[],
  excludeId?: string,
): { isValid: boolean; message?: string } => {
  // Check for empty name
  if (!name.trim()) {
    return {
      isValid: false,
      message: 'Connection name cannot be empty',
    };
  }

  // Check for reserved names (case-insensitive)
  if (name.toLowerCase().trim() === 'dbt connection') {
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
