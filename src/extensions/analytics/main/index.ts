import type {
  ExtensionMainApi,
  ExtensionMainModule,
} from '../../../extensionApi/main';
import { registerAnalyticsPagesHandlers } from './analyticsPagesHandlers';
import { registerStaticSiteHandlers } from './staticSiteHandlers';

/**
 * Main-process half of the Analytics extension: the Analytics pages of each
 * connection and their export as a static site.
 */
const activate = (api: ExtensionMainApi): void => {
  registerAnalyticsPagesHandlers(api);
  registerStaticSiteHandlers(api);
};

export const analyticsMain: ExtensionMainModule = { activate };
