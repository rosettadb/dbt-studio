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
import { createSqlAgent } from '../../../src/extensions/sql/main/sqlAgent';
import { getScreenAgent } from '../../../src/main/services/ai/agents/screenAgents';

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
// The agent itself is built from the AI SDK; not under test here.
jest.mock('../../../src/extensions/sql/main/sqlAgent', () => ({
  createSqlAgent: jest.fn(async () => 'the sql agent'),
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

    await host.deactivateAll();
  });

  it('provides the AI agent of the SQL Editor screen, and takes it back', async () => {
    const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
    host.registerBuiltin(sqlManifest, sqlMain);
    await host.start();
    expect(host.list()).toMatchObject([{ id: 'rosetta.sql', state: 'active' }]);

    const base: any = { model: 'm' };
    const context: any = {
      conversationId: 7,
      toolMode: 'chat',
      connectionMeta: { name: 'c', type: 'postgres' },
      connectionId: 'c1',
      enabledTools: { readFile: true },
      disabledTools: [],
      skills: 'skills',
    };
    await expect(getScreenAgent('sql')?.(base, context)).resolves.toBe(
      'the sql agent',
    );
    expect(createSqlAgent).toHaveBeenCalledWith(base, {
      connectionMeta: context.connectionMeta,
      enabledTools: context.enabledTools,
      skills: 'skills',
      conversationId: 7,
      toolMode: 'chat',
    });

    await host.deactivateAll();
    expect(getScreenAgent('sql')).toBeUndefined();
  });
});
