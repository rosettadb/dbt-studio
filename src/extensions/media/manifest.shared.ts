/**
 * Manifest of the Media Viewer extension: displays images and videos
 * directly in the project editor instead of raw binary text. Ships inside Studio.
 */
export const mediaManifest = {
  name: 'media',
  publisher: 'rosetta',
  displayName: 'Media Viewer',
  description: 'View image and video files directly in the project editor.',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main/index',
  renderer: 'renderer/index',
};
