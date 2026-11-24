import { ipcMain } from 'electron';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import {
  dashboardCards,
  workspaceTabRegistry,
} from '../../../src/extensionHost/renderer/contributions.renderer';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';
import { analyticsManifest } from '../../../src/extensions/analytics/manifest.shared';
import { analyticsRenderer } from '../../../src/extensions/analytics/renderer';
import { analyticsMain } from '../../../src/extensions/analytics/main';

// ESM-only packages somewhere below the Analytics components; not under test.
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-raw', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);
jest.mock('rehype-sanitize', () => () => undefined);
// The markdown text of a page builds on those packages at load.
jest.mock(
  '../../../src/extensions/analytics/renderer/bi/markdown/MarkdownText',
  () => jest.requireActual('../renderer/analytics/bi/markdownTextMock'),
);
// The Analytics pages store is Studio's database; it has its own tests.
jest.mock('../../../src/main/services/analyticsPages.service', () => ({
  AnalyticsPagesService: {},
}));
// The static site export has its own tests; here only its channels matter.
jest.mock('../../../src/extensions/analytics/main/staticSite.service', () => ({
  StaticSiteService: {},
}));

const description = (state: 'active' | 'disabled') => {
  const parsed = parseExtensionManifest(analyticsManifest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return {
    id: 'rosetta.analytics',
    manifest: parsed.manifest,
    source: 'builtin' as const,
    enabled: state === 'active',
    state,
  };
};

describe('Analytics extension', () => {
  it('has a valid manifest', () => {
    expect(parseExtensionManifest(analyticsManifest)).toMatchObject({
      ok: true,
    });
  });

  it('adds its tab to the SQL Editor and Notebooks screens and its Home card, and takes them back', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(analyticsManifest, analyticsRenderer);

    await host.apply([description('active')]);

    ['sql', 'notebooks'].forEach((screenId) => {
      const tab = workspaceTabRegistry(screenId).get('analytics');
      expect(tab).toMatchObject({ label: 'Analytics', order: 100 });
      // The assistant of the tab is the Analytics one, on the open page
      expect(tab?.assistant?.('page-1')).toEqual({
        screenKey: 'analytics',
        pageId: 'page-1',
      });
      expect(tab?.assistant?.(null)).toEqual({
        screenKey: 'analytics',
        pageId: undefined,
      });
    });
    expect(dashboardCards.get('analytics')).toMatchObject({
      title: 'Analytics',
      category: 'BI & Viz',
      // Fourth: after the SQL Editor (300), before Data Lake (500)
      order: 400,
    });

    await host.apply([description('disabled')]);

    expect(workspaceTabRegistry('sql').get('analytics')).toBeUndefined();
    expect(workspaceTabRegistry('notebooks').get('analytics')).toBeUndefined();
    expect(dashboardCards.get('analytics')).toBeUndefined();
  });

  it('opens the SQL Editor on the Analytics tab from the Home card', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(analyticsManifest, analyticsRenderer);
    await host.apply([description('active')]);

    const navigate = jest.fn();
    const openSidebar = jest.fn();
    dashboardCards
      .get('analytics')
      ?.onSelect?.({ navigate, openSidebar, hasProjects: false });

    expect(openSidebar).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/app/sql', {
      state: { tab: 'analytics' },
    });

    await host.apply([description('disabled')]);
  });

  it('answers the Analytics page and static site channels from its main half', async () => {
    (ipcMain.handle as jest.Mock).mockClear();
    const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
    host.registerBuiltin(analyticsManifest, analyticsMain);

    await host.start();

    expect(host.list()).toMatchObject([
      { id: 'rosetta.analytics', state: 'active' },
    ]);
    expect(
      (ipcMain.handle as jest.Mock).mock.calls.map(([channel]) => channel),
    ).toEqual([
      'analyticsPages:list',
      'analyticsPages:get',
      'analyticsPages:create',
      'analyticsPages:update',
      'analyticsPages:delete',
      'analytics:static-site:build',
      'analytics:static-site:open-folder',
      'analytics:static-site:open-preview',
      'analytics:static-site:get-state',
      'analytics:static-site:pick-folder',
      'analytics:static-site:get-default-path',
      'analytics:static-site:folder-exists',
      'analytics:static-site:delete-build',
    ]);
  });
});
