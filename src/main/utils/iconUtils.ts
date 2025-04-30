import { app, nativeImage } from 'electron';
import path from 'path';

/**
 * Returns the absolute path to the assets directory.
 */
const getAssetsPath = () => {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(process.cwd(), 'assets');
};

/**
 * Creates the main application icon based on platform.
 */
export const createAppIcon = () => {
  const RESOURCES_PATH = getAssetsPath();

  let iconPath = '';
  if (process.platform === 'darwin') {
    iconPath = path.join(RESOURCES_PATH, 'icon.png'); // macOS prefers PNG
  } else if (process.platform === 'win32') {
    iconPath = path.join(RESOURCES_PATH, 'icon.ico'); // Windows requires .ico
  } else {
    iconPath = path.join(RESOURCES_PATH, 'icon.png'); // Linux typically uses PNG
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn(`Could not load application icon from: ${iconPath}`);
    return nativeImage.createEmpty();
  }

  return icon;
};

/**
 * Sets up the application icon for all platforms.
 */
export const setupApplicationIcon = () => {
  const icon = createAppIcon();
  if (icon.isEmpty()) {
    return;
  }

  if (process.platform === 'darwin') {
    app.dock.setIcon(icon);
  }

  app.setAppUserModelId(app.name);
};

/**
 * (Optional) Creates a multi-resolution icon for tray or notifications.
 */
export const createMultiResolutionIcon = () => {
  const RESOURCES_PATH = getAssetsPath();

  const baseIcon = nativeImage.createFromPath(
    path.join(RESOURCES_PATH, 'icon.png'),
  );
  if (baseIcon.isEmpty()) {
    console.warn('Could not load base PNG icon for multi-resolution icon.');
    return nativeImage.createEmpty();
  }

  // Electron automatically handles different scale factors if the image is large enough.
  // So you don't need to manually add multiple resolutions unless you have them.

  return baseIcon;
};
