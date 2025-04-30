import { app, net } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'url';

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../../assets');

export class AssetServer {
  static fromNodeModules(relativePath: string) {
    const url = pathToFileURL(
      path.join(RESOURCES_PATH, relativePath),
    ).toString();
    return net.fetch(url, { bypassCustomProtocolHandlers: true });
  }
}
