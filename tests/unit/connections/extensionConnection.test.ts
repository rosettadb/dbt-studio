import './characterization/mocks';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import ConnectorsService from '../../../src/main/services/connectors.service';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import type { ExtensionMainApi } from '../../../src/extensionApi/main';
import {
  agentHintFor,
  getConnector,
  getDbtConnector,
} from '../../../src/connections/registry.main';
import {
  canUseAsDbtConnection,
  descriptorFor,
  getDescriptor,
  listDescriptors,
} from '../../../src/connections/registry.shared';

// A database that comes from an extension: registered with
// api.connections.register, then used through the same service calls as
// Studio's own databases.

const manifest = {
  name: 'acmedb',
  publisher: 'acme',
  version: '1.0.0',
  engines: { rosettaStudio: '*' },
  main: 'main.js',
};
const EXTENSION_ID = 'acme.acmedb';

const validate = jest.fn(async (conn: any) => {
  if (!conn.host) throw new Error('Host is required');
});
const test = jest.fn(async () => true);
const query = jest.fn(async (_conn: any, sql: string) => ({
  success: true,
  data: [{ answer: 42 }],
  fields: [{ name: 'answer', type: 0 }],
  rowCount: 1,
  sql,
}));
const extractSchema = jest.fn(async () => ({
  tables: [{ name: 't', schema: 'main', columns: [] }],
}));
const dispose = jest.fn();

const acmeConnection = (overrides: Record<string, unknown> = {}): any => ({
  descriptor: {
    type: 'acmedb',
    displayName: 'AcmeDB',
    aliases: ['acme'],
  },
  validate,
  test,
  query,
  extractSchema,
  dispose,
  ...overrides,
});

let userData: string;

const startWith = async (
  activate: (api: ExtensionMainApi) => void,
): Promise<ExtensionHostMain> => {
  const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
  host.registerBuiltin(manifest, { activate });
  await host.start();
  return host;
};

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-conn-ext-'));
  (app.getPath as jest.Mock).mockReturnValue(userData);
  jest.clearAllMocks();
  // A refused registration is logged by the host; expected in these tests.
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  fs.removeSync(userData);
  jest.restoreAllMocks();
});

describe('a database added by an extension', () => {
  it('is used through the same service calls as a built-in one, and is gone when the extension is switched off', async () => {
    const host = await startWith((api) => {
      api.connections.register(acmeConnection());
    });
    expect(host.list()).toMatchObject([{ id: EXTENSION_ID, state: 'active' }]);

    const conn: any = { type: 'acmedb', name: 'my acme', host: 'db.acme' };

    await expect(ConnectorsService.validateConnection(conn)).resolves.toBe(
      undefined,
    );
    await expect(
      ConnectorsService.validateConnection({ ...conn, host: '' }),
    ).rejects.toThrow('Host is required');

    await expect(ConnectorsService.testConnection(conn)).resolves.toBe(true);
    expect(test).toHaveBeenCalledWith(conn);

    const response = await ConnectorsService.executeSelectStatement({
      connection: conn,
      query: 'SELECT 42 AS answer',
      projectName: 'proj',
    } as any);
    expect(response).toMatchObject({ success: true, data: [{ answer: 42 }] });
    expect(query.mock.calls[0][1]).toBe('SELECT 42 AS answer');

    await host.setEnabled(EXTENSION_ID, false);

    expect(getConnector('acmedb')).toBeUndefined();
    expect(getDescriptor('acmedb')).toBeUndefined();
    expect(dispose).toHaveBeenCalledTimes(1);
    await expect(ConnectorsService.testConnection(conn)).rejects.toThrow(
      'Unsupported connection type',
    );
  });

  it('gets the values of a plain SQL database for what its descriptor leaves out, and is never a dbt connection', async () => {
    const host = await startWith((api) => {
      api.connections.register(
        acmeConnection({
          descriptor: {
            type: 'acmedb',
            displayName: 'AcmeDB',
            aliases: ['acme'],
            // An extension cannot make its database a dbt one
            capabilities: { dbt: true, dbtV2: true, nativeExport: true },
            sql: { rules: { quote: 'backtick' } },
          },
        }),
      );
    });

    expect(getDescriptor('acmedb')).toMatchObject({
      type: 'acmedb',
      displayName: 'AcmeDB',
      capabilities: {
        dbt: false,
        dbtV2: false,
        nativeExport: true,
        icebergCatalog: false,
        listedByDefault: true,
      },
      sql: { rules: { quote: 'backtick', folding: 'none', limit: 'limit' } },
    });
    expect(descriptorFor('acme')?.type).toBe('acmedb');
    expect(canUseAsDbtConnection('acmedb')).toBe(false);
    expect(getDbtConnector('acmedb')).toBeUndefined();
    // Listed after Studio's own databases
    expect(
      listDescriptors()
        .map((d) => d.type)
        .pop(),
    ).toBe('acmedb');
    // The AI agents get the general dialect text
    expect(agentHintFor('acmedb', 'sql')).toContain('acmedb database');

    const connector = getConnector('acmedb')!;
    const a = { type: 'acmedb', name: 'a', host: 'h', port: 1 };
    expect(connector.sameTarget(a, { ...a, name: 'b' })).toBe(true);
    expect(connector.sameTarget(a, { ...a, port: 2 })).toBe(false);
    expect(connector.nameHint(a)).toBe('a');

    await host.setEnabled(EXTENSION_ID, false);
  });

  it('cannot take the type of a database that already exists', async () => {
    const postgres = getConnector('postgres');

    const host = await startWith((api) => {
      api.connections.register(
        acmeConnection({
          descriptor: { type: 'postgres', displayName: 'Not Postgres' },
        }),
      );
    });

    expect(host.list()).toMatchObject([
      {
        id: EXTENSION_ID,
        state: 'failed',
        error: 'Connection type "postgres" is already registered',
      },
    ]);
    expect(getConnector('postgres')).toBe(postgres);
    expect(getDescriptor('postgres')?.displayName).toBe('PostgreSQL');
  });

  it('is refused when a required function or the type is missing', async () => {
    const withoutQuery = await startWith((api) => {
      api.connections.register(acmeConnection({ query: undefined }));
    });
    expect(withoutQuery.list()[0]).toMatchObject({
      state: 'failed',
      error: 'Connection "acmedb" needs a `query` function',
    });
    expect(getDescriptor('acmedb')).toBeUndefined();

    const withoutType = await startWith((api) => {
      api.connections.register(
        acmeConnection({ descriptor: { displayName: 'AcmeDB' } }),
      );
    });
    expect(withoutType.list()[0]).toMatchObject({
      state: 'failed',
      error: 'A connection needs a descriptor with a `type`',
    });
  });
});
