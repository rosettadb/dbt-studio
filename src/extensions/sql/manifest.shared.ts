/**
 * Manifest of the SQL Editor extension: the SQL Editor screen, saved
 * queries and query history. Ships inside Studio.
 */
export const sqlManifest = {
  name: 'sql',
  publisher: 'rosetta',
  displayName: 'SQL Editor',
  description: 'Write and run SQL against your connections.',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main/index',
  renderer: 'renderer/index',
};
