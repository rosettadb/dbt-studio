import DuckLakeInstanceStore from '../../../../src/main/services/duckLake/instanceStore.service';

const setCredential = jest.fn();
const getCredential = jest.fn();
const deleteCredential = jest.fn();

jest.mock('../../../../src/main/services/secureStorage.service', () => ({
  __esModule: true,
  default: {
    setCredential: (...args: any[]) => setCredential(...args),
    getCredential: (...args: any[]) => getCredential(...args),
    deleteCredential: (...args: any[]) => deleteCredential(...args),
  },
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

import fs from 'fs';

describe('DuckLakeInstanceStore (main)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        version: '1.0.0',
        instances: [],
        lastModified: new Date('2020-01-01').toISOString(),
      }),
    );

    (fs.statSync as jest.Mock).mockReturnValue({ size: 123 });

    getCredential.mockResolvedValue(null);
  });

  it('initialize creates directory and instances file when missing', async () => {
    (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
      if (p.includes('datalake')) return false;
      if (p.endsWith('instances.json')) return false;
      return true;
    });

    await DuckLakeInstanceStore.initialize();

    expect(fs.mkdirSync).toHaveBeenCalledWith(expect.stringContaining('datalake'), {
      recursive: true,
    });
    expect(fs.writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('instances.json'),
      expect.any(String),
      'utf-8',
    );
  });

  it('saveInstance stores credentials and strips secrets before writing metadata', async () => {
    const instance = {
      id: 'i1',
      name: 'demo',
      dataPath: '/tmp/data',
      catalog: {
        type: 'postgresql',
        postgresql: {
          host: 'h',
          port: 5432,
          database: 'db',
          username: 'u',
          password: 'pw',
          ssl: false,
        },
      },
      storage: {
        type: 's3',
        s3: {
          bucket: 'b',
          region: 'us-east-1',
          accessKeyId: 'ak',
          secretAccessKey: 'sk',
        },
      },
      createdAt: new Date('2020-01-01'),
      updatedAt: new Date('2020-01-02'),
      status: 'inactive',
    } as any;

    await DuckLakeInstanceStore.saveInstance(instance);

    expect(setCredential).toHaveBeenCalledWith(
      'ducklake-i1-postgresql-password',
      'pw',
    );
    expect(setCredential).toHaveBeenCalledWith('ducklake-i1-s3-secret', 'sk');

    const writeCall = (fs.writeFileSync as jest.Mock).mock.calls.find((c) =>
      String(c[0]).includes('instances.json'),
    );
    expect(writeCall).toBeTruthy();

    const writtenJson = JSON.parse(writeCall![1]);
    expect(writtenJson.instances).toHaveLength(1);

    const persisted = writtenJson.instances[0];
    expect(persisted.catalog.postgresql.password).toBeUndefined();
    expect(persisted.storage.s3.secretAccessKey).toBeUndefined();
  });

  it('retrieveCredentials merges stored secrets into persisted configs', async () => {
    getCredential.mockImplementation(async (account: string) => {
      if (account === 'ducklake-i1-postgresql-password') return 'pw';
      if (account === 'ducklake-i1-s3-secret') return 'sk';
      return null;
    });

    const out = await DuckLakeInstanceStore.retrieveCredentials(
      'i1',
      {
        type: 'postgresql',
        postgresql: {
          host: 'h',
          port: 5432,
          database: 'db',
          username: 'u',
          ssl: false,
        },
      } as any,
      {
        type: 's3',
        s3: { bucket: 'b', region: 'us-east-1', accessKeyId: 'ak' },
      } as any,
    );

    expect(out.catalog.postgresql?.password).toBe('pw');
    expect(out.storage?.s3?.secretAccessKey).toBe('sk');
  });

  it('deleteInstance removes instance and deletes credential keys', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(
      JSON.stringify({
        version: '1.0.0',
        instances: [
          {
            id: 'i1',
            name: 'demo',
            dataPath: '/tmp/data',
            catalog: { type: 'postgresql', postgresql: { host: 'h' } },
            storage: { type: 'azure', azure: { accountName: 'a' } },
            createdAt: new Date('2020-01-01').toISOString(),
            updatedAt: new Date('2020-01-02').toISOString(),
            status: 'inactive',
          },
        ],
        lastModified: new Date('2020-01-01').toISOString(),
      }),
    );

    await DuckLakeInstanceStore.deleteInstance('i1');

    expect(deleteCredential).toHaveBeenCalledWith('ducklake-i1-postgresql-password');
    expect(deleteCredential).toHaveBeenCalledWith('ducklake-i1-azure-key');
    expect(deleteCredential).toHaveBeenCalledWith('ducklake-i1-azure-conn-string');

    const writtenJson = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
    expect(writtenJson.instances).toHaveLength(0);
  });
});
