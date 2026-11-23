import { ipcMain } from 'electron';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import {
  dashboardCards,
  navigationItems,
  screens,
} from '../../../src/extensionHost/renderer/contributions.renderer';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';
import { sqlManifest } from '../../../src/extensions/sql/manifest.shared';
import { sqlRenderer } from '../../../src/extensions/sql/renderer';
import { sqlMain } from '../../../src/extensions/sql/main';

// ESM-only packages somewhere below Studio's components; not under test.
jest.mock('react-markdown', () => ({ __esModule: true, default: () => null }));
jest.mock('remark-gfm', () => () => undefined);
jest.mock('rehype-raw', () => () => undefined);
jest.mock('rehype-highlight', () => () => undefined);
jest.mock('rehype-sanitize', () => () => undefined);
// The assistant pane has its own tests and does not load under jest as is.
jest.mock('../../../src/renderer/components/chat', () => ({
  ChatWindow: () => null,
}));
// The saved queries are kept in Studio's JSON store.
jest.mock('../../../src/main/database', () => ({
  __esModule: true,
  default: { getField: jest.fn(), updateField: jest.fn() },
}));

const description = (state: 'active' | 'disabled') => {
  const parsed = parseExtensionManifest(sqlManifest);
  if (!parsed.ok) throw new Error(parsed.errors.join('; '));
  return {
    id: 'rosetta.sql',
    manifest: parsed.manifest,
    source: 'builtin' as const,
    enabled: state === 'active',
    state,
  };
};

describe('SQL Editor extension', () => {
  it('has a valid manifest', () => {
    expect(parseExtensionManifest(sqlManifest)).toMatchObject({ ok: true });
  });

  it('adds its sidebar entry, screen and Home card, and takes them back', async () => {
    const host = new ExtensionHostRenderer();
    host.registerBuiltin(sqlManifest, sqlRenderer);

    await host.apply([description('active')]);

    expect(navigationItems.get('sql')).toMatchObject({
      path: '/app/sql',
      label: 'SQL Editor',
      testId: 'nav-item-sql',
      // Third: after Project (200), before Notebooks (400)
      order: 300,
    });
    expect(screens.get('sql')).toMatchObject({
      paths: ['sql'],
      // The top bar shows the AI assistant button on this screen
      assistant: true,
      redirects: [{ from: 'data-lake/history', to: '/app/sql' }],
    });
    expect(dashboardCards.get('sql-editor')).toMatchObject({
      title: 'SQL Editor',
      path: '/app/sql',
      order: 300,
    });

    await host.apply([description('disabled')]);

    expect(navigationItems.get('sql')).toBeUndefined();
    expect(screens.get('sql')).toBeUndefined();
    expect(dashboardCards.get('sql-editor')).toBeUndefined();
  });

  it('answers the saved-query channels from its main half', async () => {
    (ipcMain.handle as jest.Mock).mockClear();
    const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
    host.registerBuiltin(sqlManifest, sqlMain);

    await host.start();

    expect(host.list()).toMatchObject([{ id: 'rosetta.sql', state: 'active' }]);
    expect(
      (ipcMain.handle as jest.Mock).mock.calls.map(([channel]) => channel),
    ).toEqual([
      'savedQueries:list',
      'savedQueries:create',
      'savedQueries:update',
      'savedQueries:delete',
    ]);
  });
});
