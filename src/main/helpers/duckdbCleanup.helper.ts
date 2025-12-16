/**
 * DuckDB Cleanup Helper
 * Contains utilities for properly cleaning up DuckDB connections and instances
 */

/**
 * Properly cleanup DuckDB connection and instance
 * Note: DuckDB Node.js API handles cleanup automatically when objects go out of scope
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function cleanup(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _connection: any | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _instance: any | null,
): Promise<void> {
  try {
    // DuckDB Node.js API handles cleanup automatically
    // Connections and instances are cleaned up when they go out of scope
    // No explicit close methods are needed or available
    // Nothing to do - cleanup is automatic
    // The parameters will be garbage collected when they go out of scope
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during DuckDB cleanup:', error);
    // Don't throw - cleanup should be best effort
  }
}

/**
 * Safe cleanup that handles null values
 */
export async function safeCleanup(
  connection?: any | null,
  instance?: any | null,
): Promise<void> {
  await cleanup(connection || null, instance || null);
}
