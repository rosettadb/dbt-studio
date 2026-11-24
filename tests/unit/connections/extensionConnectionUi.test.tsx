import React from 'react';
import { ExtensionHostRenderer } from '../../../src/extensionHost/renderer/ExtensionHost.renderer';
import type { ExtensionRendererApi } from '../../../src/extensionApi/renderer';
import type { ExtensionDescription } from '../../../src/extensionHost/shared/manifest.shared';
import {
  connectionFormFor,
  connectionIcon,
  connectionLabel,
  creatableConnections,
  getConnectionUi,
} from '../../../src/connections/registry.renderer';
import {
  CONNECTION_TYPES,
  getDescriptor,
} from '../../../src/connections/registry.shared';

// The UI of a database that comes from an extension: registered with
// api.connections.register in the window, then found by the same lookups
// the add-connection screen and the connection lists use.

const describeExtension = (
  state: ExtensionDescription['state'],
): ExtensionDescription => ({
  id: 'acme.acmedb',
  manifest: {
    name: 'acmedb',
    publisher: 'acme',
    version: '1.0.0',
    engines: { rosettaStudio: '*' },
    renderer: 'renderer.js',
  },
  source: 'builtin',
  enabled: state === 'active',
  state,
});

const AcmeForm: React.FC = () => null;

const startWith = async (
  activate: (api: ExtensionRendererApi) => void,
): Promise<ExtensionHostRenderer> => {
  const host = new ExtensionHostRenderer();
  host.registerBuiltin({ publisher: 'acme', name: 'acmedb' }, { activate });
  await host.apply([describeExtension('active')]);
  return host;
};

const builtinTiles = CONNECTION_TYPES.filter((type) => type !== 'ducklake');

describe('the UI of a database added by an extension', () => {
  beforeEach(() => {
    // A refused registration is logged by the host; expected in these tests.
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('gets a tile after the built-in ones, its form, icon and label, and is gone when the extension is switched off', async () => {
    const host = await startWith((api) => {
      api.connections.register({
        descriptor: { type: 'acmedb', displayName: 'AcmeDB' },
        ui: {
          icon: 'rosetta-ext://acme.acmedb/icon.png',
          Form: AcmeForm,
          listDetails: (conn: any) => `Host: ${conn.host}`,
        },
      });
    });

    expect(creatableConnections().map((ui) => ui.type)).toEqual([
      ...builtinTiles,
      'acmedb',
    ]);
    expect(connectionFormFor('acmedb')).toBe(AcmeForm);
    expect(connectionIcon('acmedb')).toBe('rosetta-ext://acme.acmedb/icon.png');
    expect(connectionLabel('acmedb')).toBe('AcmeDB');
    expect(
      getConnectionUi('acmedb')?.listDetails?.({ host: 'db.acme' } as any),
    ).toBe('Host: db.acme');
    expect(getDescriptor('acmedb')?.capabilities.dbt).toBe(false);
    // The SQL Editor gets the saved settings when the extension maps nothing
    expect(
      getConnectionUi('acmedb')?.sqlEditorInput?.({
        type: 'acmedb',
        name: 'my acme',
        host: 'db.acme',
      } as any),
    ).toEqual({ type: 'acmedb', name: 'my acme', host: 'db.acme' });

    await host.apply([describeExtension('disabled')]);

    expect(creatableConnections().map((ui) => ui.type)).toEqual(builtinTiles);
    expect(getConnectionUi('acmedb')).toBeUndefined();
    expect(getDescriptor('acmedb')).toBeUndefined();
    // An unknown type gets the Postgres form, as before
    expect(connectionFormFor('acmedb')).toBe(connectionFormFor('postgres'));
  });

  it('cannot take the type of a database that already exists', async () => {
    const postgresUi = getConnectionUi('postgres');

    const host = await startWith((api) => {
      api.connections.register({
        descriptor: { type: 'postgres', displayName: 'Not Postgres' },
        ui: { icon: 'x.png', Form: AcmeForm },
      });
    });

    expect(host.getSnapshot()).toMatchObject([
      {
        id: 'acme.acmedb',
        uiActive: false,
        uiError: 'Connection type "postgres" is already registered',
      },
    ]);
    expect(getConnectionUi('postgres')).toBe(postgresUi);
    expect(connectionLabel('postgres')).toBe('PostgreSQL');
  });
});
