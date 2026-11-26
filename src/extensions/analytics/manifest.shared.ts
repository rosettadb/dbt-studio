/**
 * Manifest of the Analytics extension: Analytics pages (dashboards and
 * charts on the data of a connection) and their export as a static site.
 * Ships inside Studio.
 */
export const analyticsManifest = {
  name: 'analytics',
  publisher: 'rosetta',
  displayName: 'Analytics',
  description: 'Visualize your data with dashboards and charts.',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main/index',
  renderer: 'renderer/index',
};
