import * as settingsServices from './settings.services';
import * as projectsServices from './projects.service';
import * as connectorsServices from './connectors.service';
import * as gitServices from './git.service';
import * as updateServices from './update.service';
import * as secureStorageService from './secureStorage.service';
import * as utilsService from './utils.service';
import cloudExplorerService from './cloudExplorer.service';
import { connectionStorage } from './connectionStorage.service';
import authServiceInstance from './auth.service';

export {
  settingsServices,
  projectsServices,
  connectorsServices,
  gitServices,
  updateServices,
  secureStorageService,
  cloudExplorerService,
  connectionStorage,
  utilsService,
  authServiceInstance as authService,
};
