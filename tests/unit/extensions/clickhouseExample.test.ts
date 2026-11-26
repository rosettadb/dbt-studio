import '../connections/characterization/mocks';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { app } from 'electron';
import ConnectorsService from '../../../src/main/services/connectors.service';
import { ExtensionHostMain } from '../../../src/extensionHost/main/ExtensionHost.main';
import { getConnector } from '../../../src/connections/registry.main';
import { getDescriptor } from '../../../src/connections/registry.shared';
import { parseExtensionManifest } from '../../../src/extensionHost/shared/manifest.shared';

// The proof for "a database as an installed extension": the example in
// docs/extensions/examples/clickhouse is installed from its folder the way
// Settings → Extensions does it, and its connections are then used through
// Studio's own service calls. ClickHouse itself is replaced by a fake HTTP
// answer.

const EXAMPLE = path.join(
  __dirname,
  '../../../docs/extensions/examples/clickhouse',
);
const ID = 'studio-examples.clickhouse';

const conn: any = {
  type: 'clickhouse',
  name: 'play',
  host: 'ch.example.com',
  port: 8443,
  secure: true,
  username: 'reader',
  password: 'secret',
  database: 'shop',
};

const answer = (body: unknown, ok = true, status = 200) => ({
  ok,
  status,
  text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
});

let userData: string;
let fetchMock: jest.Mock;
const realFetch = (global as any).fetch;

beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-ch-'));
  (app.getPath as jest.Mock).mockReturnValue(userData);
  fetchMock = jest.fn();
  (global as any).fetch = fetchMock;
});

afterEach(() => {
  fs.removeSync(userData);
  (global as any).fetch = realFetch;
});

describe('the ClickHouse example extension', () => {
  it('has a valid manifest', () => {
    expect(
      parseExtensionManifest(
        fs.readJsonSync(path.join(EXAMPLE, 'package.json')),
      ),
    ).toMatchObject({ ok: true });
  });

  it('adds ClickHouse as a database when installed, and takes it away when uninstalled', async () => {
    const host = new ExtensionHostMain({ studioVersion: '1.7.8' });
    await host.start();
    expect(getConnector('clickhouse')).toBeUndefined();

    const id = await host.install(EXAMPLE);

    expect(id).toBe(ID);
    expect(host.list().find((e) => e.id === ID)).toMatchObject({
      source: 'installed',
      state: 'active',
    });
    expect(getDescriptor('clickhouse')).toMatchObject({
      displayName: 'ClickHouse',
      capabilities: { dbt: false, listedByDefault: true },
      sql: { rules: { quote: 'backtick' } },
    });

    // Test connection
    fetchMock.mockResolvedValueOnce(
      answer({ meta: [{ name: '1', type: 'UInt8' }], data: [[1]] }),
    );
    await expect(ConnectorsService.testConnection(conn)).resolves.toBe(true);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://ch.example.com:8443/?database=shop&default_format=JSONCompact',
    );
    expect(request).toMatchObject({
      method: 'POST',
      body: 'SELECT 1',
      headers: { 'X-ClickHouse-User': 'reader', 'X-ClickHouse-Key': 'secret' },
    });
    await expect(
      ConnectorsService.testConnection({ ...conn, host: '' }),
    ).rejects.toThrow('Host is required');

    // A query from the SQL Editor
    fetchMock.mockResolvedValueOnce(
      answer({
        meta: [
          { name: 'id', type: 'UInt32' },
          { name: 'name', type: 'String' },
        ],
        data: [
          [1, 'a'],
          [2, 'b'],
        ],
      }),
    );
    await expect(
      ConnectorsService.executeSelectStatement({
        connection: conn,
        query: 'SELECT id, name FROM items',
        projectName: 'proj',
      } as any),
    ).resolves.toMatchObject({
      success: true,
      data: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' },
      ],
      fields: [
        { name: 'id', type: -1 },
        { name: 'name', type: -1 },
      ],
      rowCount: 2,
    });

    // A statement that returns nothing, and one ClickHouse refuses
    fetchMock.mockResolvedValueOnce(answer(''));
    await expect(
      ConnectorsService.executeSelectStatement({
        connection: conn,
        query: 'CREATE TABLE t (a Int8) ENGINE = Memory',
        projectName: 'proj',
      } as any),
    ).resolves.toMatchObject({ success: true, data: [], rowCount: 0 });
    fetchMock.mockResolvedValueOnce(
      answer('Code: 62. DB::Exception: Syntax error', false, 400),
    );
    await expect(
      ConnectorsService.executeSelectStatement({
        connection: conn,
        query: 'SELEC 1',
        projectName: 'proj',
      } as any),
    ).resolves.toMatchObject({
      success: false,
      error: 'Code: 62. DB::Exception: Syntax error',
    });

    // The tables for the Data tree
    fetchMock.mockResolvedValueOnce(
      answer({
        data: [
          ['shop', 'items', 'id', 'UInt32', 1, 1, 'MergeTree'],
          ['shop', 'items', 'note', 'Nullable(String)', 2, 0, 'MergeTree'],
          ['shop', 'totals', 'sum', 'Float64', 1, 0, 'MaterializedView'],
        ],
      }),
    );
    const { tables } = await getConnector('clickhouse')!.extractSchema(conn);
    expect(tables).toMatchObject([
      {
        name: 'items',
        type: 'TABLE',
        schema: 'shop',
        columns: [
          { name: 'id', typeName: 'UInt32', primaryKey: true, nullable: false },
          { name: 'note', typeName: 'Nullable(String)', nullable: true },
        ],
      },
      { name: 'totals', type: 'VIEW', schema: 'shop' },
    ]);

    await host.uninstall(ID);

    expect(getConnector('clickhouse')).toBeUndefined();
    expect(getDescriptor('clickhouse')).toBeUndefined();
    await expect(ConnectorsService.testConnection(conn)).rejects.toThrow(
      'Unsupported connection type',
    );
  });
});
