/**
 * Escapes special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generates a unique connection name by appending _N suffix
 * @param baseName - The original connection name to clone
 * @param existingNames - Array of all existing connection names
 * @returns A unique name with _N suffix (e.g., "MyConnection_2")
 */
export function generateCloneConnectionName(
  baseName: string,
  existingNames: string[],
): string {
  // Remove any existing _N suffix from the base name
  const cleanBase = baseName.replace(/_\d+$/, '');

  // Create a case-insensitive set of existing names for checking
  const existingNamesLower = new Set(
    existingNames.map((name) => name.toLowerCase()),
  );

  // If the clean base name doesn't exist, use it
  if (!existingNamesLower.has(cleanBase.toLowerCase())) {
    return cleanBase;
  }

  // Find the highest existing _N suffix for this base name
  let highestNumber = 1;
  const pattern = new RegExp(`^${escapeRegExp(cleanBase)}_(?<num>\\d+)$`, 'i');

  // eslint-disable-next-line no-restricted-syntax
  for (const name of existingNames) {
    const match = pattern.exec(name);
    if (match && match.groups?.num) {
      const num = parseInt(match.groups.num, 10);
      if (num > highestNumber) {
        highestNumber = num;
      }
    }
  }

  // Generate the next number in sequence
  let nextNumber = highestNumber + 1;
  let candidateName = `${cleanBase}_${nextNumber}`;

  // Keep incrementing until we find a unique name
  while (existingNamesLower.has(candidateName.toLowerCase())) {
    // eslint-disable-next-line no-plusplus
    nextNumber++;
    candidateName = `${cleanBase}_${nextNumber}`;
  }

  return candidateName;
}
