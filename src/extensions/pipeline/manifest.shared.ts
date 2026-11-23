/**
 * Manifest of the Pipelines extension: the pipeline designer, the local
 * runner and pipeline templates. Ships inside Studio.
 */
export const pipelineManifest = {
  name: 'pipeline',
  publisher: 'rosetta',
  displayName: 'Pipelines',
  description:
    'Design pipelines visually and run them on Rosetta Cloud or with the local runner.',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main/index',
  renderer: 'renderer/index',
  // It adds an app-wide provider (the local runner's state), which cannot
  // be mounted or removed while the app is open.
  requiresRestart: true,
};
