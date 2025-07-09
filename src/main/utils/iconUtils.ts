import { app, nativeImage } from 'electron';
import path from 'path';

/**
 * Returns the absolute path to the assets` directory.
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

  let iconPath;
  if (process.platform === 'darwin') {
    iconPath = path.join(RESOURCES_PATH, 'icon.png');
  } else if (process.platform === 'win32') {
    iconPath = path.join(RESOURCES_PATH, 'icon.ico');
  } else {
    iconPath = path.join(RESOURCES_PATH, 'icon.png');
  }

  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
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
    return nativeImage.createEmpty();
  }
  return baseIcon;
};
