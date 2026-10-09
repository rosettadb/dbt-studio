import { prepareImportedConnection } from '../../../../src/renderer/utils/notebookConnectionTransfer';
import type {
  ConnectionInput,
  SpannerConnection,
} from '../../../../src/types/backend';

const spanner: SpannerConnection = {
  type: 'spanner',
  name: 'imported',
  project: 'demo-project',
  instance: 'test-instance',
  database: 'test-db',
  schema: '',
  username: 'demo-project',
  password: '',
  authMethod: 'service-account',
  keyfile: '{"type":"service_account","client_email":"a","private_key":"k"}',
};

const makeStorage = () =>
  ({
    setSpannerServiceAccountKey: jest.fn().mockResolvedValue(undefined),
  }) as any;

describe('prepareImportedConnection', () => {
  it('stores an imported Spanner key and saves only its name', async () => {
    const storage = makeStorage();
    const saved = await prepareImportedConnection(spanner, storage);
    expect(storage.setSpannerServiceAccountKey).toHaveBeenCalledWith(
      spanner.keyfile,
      'imported',
    );
    expect(saved).toMatchObject({ keyfile: 'db-spanner-imported' });
    expect(JSON.stringify(saved)).not.toContain('private_key');
  });

  it.each<[string, ConnectionInput]>([
    [
      'a Spanner connection without a key',
      { ...spanner, authMethod: 'adc', keyfile: '' },
    ],
    [
      'a Spanner connection that already names its key',
      { ...spanner, keyfile: 'db-spanner-imported' },
    ],
    [
      'another connection type',
      {
        type: 'sqlite',
        name: 'local',
        database_path: '/tmp/a.db',
      } as ConnectionInput,
    ],
  ])('leaves %s unchanged', async (_label, connection) => {
    const storage = makeStorage();
    await expect(prepareImportedConnection(connection, storage)).resolves.toBe(
      connection,
    );
    expect(storage.setSpannerServiceAccountKey).not.toHaveBeenCalled();
  });
});
