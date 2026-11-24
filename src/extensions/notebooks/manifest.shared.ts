/**
 * Manifest of the Notebooks extension: SQL and Python notebooks on the data
 * of a connection. Ships inside Studio.
 */
export const notebooksManifest = {
  name: 'notebooks',
  publisher: 'rosetta',
  displayName: 'Notebooks',
  description: 'Explore data in SQL and Python notebooks.',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main/index',
  renderer: 'renderer/index',
};
