import fs from 'fs';
import path from 'path';
import {
  cleanupConnectionCredentials,
  credentialStore,
  setCredential,
} from './mocks';
import databaseStore from '../../../../src/main/database';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import DuckLakeService from '../../../../src/main/services/duckLake.service';
import DuckLakeInstanceStore from '../../../../src/main/services/duckLake/instanceStore.service';
import { ProjectsService } from '../../../../src/main/services/index';
import { installDuckLakeInstances } from './duckLakeFixtures';
import {
  FIXTURES,
  LEGACY_DB2,
  cleanTempProjects,
  makeTempProject,
} from './fixtures';

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

// An in-memory stand-in for database.json.
let state: Record<string, any>;
beforeEach(() => {
  state = { connections: [], projects: [] };
  credentialStore.clear();
  setCredential.mockClear();
  (databaseStore.getField as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(clone(state[key])),
  );
  (databaseStore.updateField as jest.Mock).mockImplementation(
    (key: string, updater: (c: unknown) => unknown) => {
      state[key] = updater(clone(state[key]));
      return Promise.resolve(state[key]);
    },
  );
  jest
    .spyOn(ConnectorsService, 'oracleWalletAliases')
    .mockResolvedValue(['mydb_high']);
});
afterEach(() => {
  jest.restoreAllMocks();
  ConnectorsService.cleanupBigQueryKeyFiles();
  cleanTempProjects();
  cleanupConnectionCredentials.mockClear();
});

const saved = () => state.connections.map((c: any) => c.connection);

describe('saveNewConnection characterization', () => {
  it('oracle is validated and normalized, with no raw password stored', async () => {
    await ConnectorsService.saveNewConnection(clone(FIXTURES.oracle[0].conn));
    expect(saved()).toMatchSnapshot();
    expect(JSON.stringify(state)).not.toContain('FIXTURE-SECRET');
  });

  it('oracle that fails validation is rejected and nothing is saved', async () => {
    const bad: any = clone(FIXTURES.oracle[0].conn);
    bad.host = 'bad host!';
    await expect(ConnectorsService.saveNewConnection(bad)).rejects.toThrow(
      'Enter a valid host or bracketed IPv6 address',
    );
    expect(saved()).toEqual([]);
  });

  it('ducklake with s3 storage writes the s3 keys to secure storage', async () => {
    (DuckLakeService.getInstance as jest.Mock).mockResolvedValue({
      id: 'inst-s3',
      catalog: {},
      storage: {},
    });
    (DuckLakeInstanceStore.retrieveCredentials as jest.Mock).mockResolvedValue({
      storage: {
        type: 's3',
        s3: {
          region: 'eu-west-1',
          accessKeyId: 'AK',
          secretAccessKey: 'SK',
          sessionToken: 'ST',
        },
      },
    });
    await ConnectorsService.saveNewConnection(
      clone(FIXTURES.ducklake[0].conn),
    );
    expect(setCredential.mock.calls).toEqual([
      ['db-s3-region-dl_s3', 'eu-west-1'],
      ['db-s3-access-key-dl_s3', 'AK'],
      ['db-s3-secret-key-dl_s3', 'SK'],
      ['db-s3-session-token-dl_s3', 'ST'],
    ]);
  });

  it('ducklake with local storage writes no s3 keys', async () => {
    (DuckLakeService.getInstance as jest.Mock).mockResolvedValue({
      id: 'inst-local',
      catalog: {},
      storage: {},
    });
    (DuckLakeInstanceStore.retrieveCredentials as jest.Mock).mockResolvedValue({
      storage: { type: 'local' },
    });
    await ConnectorsService.saveNewConnection(
      clone(FIXTURES.ducklake[1].conn),
    );
    expect(setCredential).not.toHaveBeenCalled();
  });

  it('bigquery raw key file JSON is replaced by its key name', async () => {
    const bq: any = clone(FIXTURES.bigquery[0].conn);
    bq.keyfile = '{"type":"service_account","private_key":"RAW"}';
    await ConnectorsService.saveNewConnection(bq);
    expect(saved()[0].keyfile).toBe('db-bigquery-bq_plain');
    expect(JSON.stringify(state)).not.toContain('RAW');
  });

  it('rejects a duplicate connection name', async () => {
    await ConnectorsService.saveNewConnection(clone(FIXTURES.postgres[0].conn));
    await expect(
      ConnectorsService.saveNewConnection(clone(FIXTURES.postgres[0].conn)),
    ).rejects.toThrow();
  });
});

describe('saveNewConnectionForTemplate characterization', () => {
  it('oracle is normalized as well', async () => {
    await ConnectorsService.saveNewConnectionForTemplate(
      clone(FIXTURES.oracle[0].conn),
    );
    expect(saved()).toMatchSnapshot();
  });

  it('ducklake makes no secure-storage writes', async () => {
    await ConnectorsService.saveNewConnectionForTemplate(
      clone(FIXTURES.ducklake[0].conn),
    );
    expect(setCredential).not.toHaveBeenCalled();
    expect(saved()).toHaveLength(1);
  });
});

describe('loadConnections characterization', () => {
  it('hides ducklake by default and lists legacy db2 rows', async () => {
    state.connections = [
      { id: '1', connection: clone(FIXTURES.postgres[0].conn) },
      { id: '2', connection: clone(FIXTURES.ducklake[0].conn) },
      { id: '3', connection: clone(LEGACY_DB2) },
    ];
    const visible = await ConnectorsService.loadConnections();
    expect(visible.map((c) => c.id)).toEqual(['1', '3']);
    const all = await ConnectorsService.loadConnections(true);
    expect(all.map((c) => c.id)).toEqual(['1', '2', '3']);
  });
});

const mask = (value: unknown, dir: string) =>
  JSON.parse(JSON.stringify(value).split(dir).join('<PROJECT_DIR>'));

const seedProject = (dir: string, connectionId: string) => ({
  id: 'p1',
  name: 'proj',
  path: dir,
  connectionId,
});

describe('updateConnection characterization', () => {
  it('oracle rename cleans up the old name credentials', async () => {
    const before = { id: 'o1', connection: clone(FIXTURES.oracle[0].conn) };
    state.connections = [before];
    await ConnectorsService.updateConnection({
      connection: {
        id: 'o1',
        connection: { ...clone(FIXTURES.oracle[0].conn), name: 'ora_renamed' },
      },
    } as any);
    expect(cleanupConnectionCredentials).toHaveBeenCalledWith('ora_basic');
    expect(saved()[0].name).toBe('ora_renamed');
    expect(saved()[0].password).toBe('');
  });

  it('non-dbt types skip the project files', async () => {
    state.connections = [{ id: 'm1', connection: clone(FIXTURES.mysql[0].conn) }];
    (ProjectsService.loadProjects as jest.Mock).mockClear();
    await ConnectorsService.updateConnection({
      connection: {
        id: 'm1',
        connection: { ...clone(FIXTURES.mysql[0].conn), host: 'new.example.com' },
      },
    } as any);
    expect(ProjectsService.loadProjects).not.toHaveBeenCalled();
    expect(saved()[0].host).toBe('new.example.com');
  });

  it('a dbt type rewrites the files of the projects that use it', async () => {
    const dir = makeTempProject();
    const conn = clone(FIXTURES.postgres[0].conn);
    state.connections = [{ id: 'pg1', connection: conn }];
    fs.writeFileSync(
      path.join(dir, 'profiles.yml'),
      await ConnectorsService.generateProfilesYml('proj', conn),
    );
    fs.mkdirSync(path.join(dir, 'rosetta'));
    fs.writeFileSync(
      path.join(dir, 'rosetta', 'main.conf'),
      await ConnectorsService.generateRosettaYml(conn, 'proj'),
    );
    (ProjectsService.loadProjects as jest.Mock).mockResolvedValue([
      seedProject(dir, 'pg1'),
    ]);
    await ConnectorsService.updateConnection({
      connection: { id: 'pg1', connection: { ...conn, schema: 'analytics' } },
    } as any);
    expect({
      profiles: fs.readFileSync(path.join(dir, 'profiles.yml'), 'utf8'),
      mainConf: fs.readFileSync(path.join(dir, 'rosetta', 'main.conf'), 'utf8'),
    }).toMatchSnapshot();
  });

  it('reports missing project files after saving the connection', async () => {
    const dir = makeTempProject();
    state.connections = [
      { id: 'pg1', connection: clone(FIXTURES.postgres[0].conn) },
    ];
    (ProjectsService.loadProjects as jest.Mock).mockResolvedValue([
      seedProject(dir, 'pg1'),
    ]);
    let message = '';
    try {
      await ConnectorsService.updateConnection({
        connection: { id: 'pg1', connection: clone(FIXTURES.postgres[0].conn) },
      } as any);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(mask(message, dir)).toMatchSnapshot();
  });
});

describe('loadConfigurations characterization', () => {
  const run = async (conn: any, dir: string) => {
    state.connections = [{ id: 'c1', connection: conn }];
    state.projects = [seedProject(dir, 'c1')];
    return ConnectorsService.loadConfigurations('p1');
  };

  it('writes profiles.yml and main.conf for a dbt connection', async () => {
    const dir = makeTempProject();
    const project = await run(clone(FIXTURES.postgres[0].conn), dir);
    expect({
      project: mask(project, dir),
      profiles: fs.readFileSync(path.join(dir, 'profiles.yml'), 'utf8'),
      mainConf: fs.readFileSync(path.join(dir, 'rosetta', 'main.conf'), 'utf8'),
    }).toMatchSnapshot();
  });

  it('bigquery without a stored key fails', async () => {
    const dir = makeTempProject();
    await expect(run(clone(FIXTURES.bigquery[0].conn), dir)).rejects.toThrow(
      'BigQuery service account key not found in secure storage',
    );
  });

  it('bigquery materializes the key file into process.env', async () => {
    const dir = makeTempProject();
    credentialStore.set(
      'db-bigquery-bq_plain',
      JSON.stringify({ client_email: 'sa@proj.iam.gserviceaccount.com' }),
    );
    await run(clone(FIXTURES.bigquery[0].conn), dir);
    const keyPath = process.env['db-bigquery-bq_plain'] as string;
    expect(keyPath).toMatch(/rosetta-bigquery-.*\.json$/);
    expect(fs.existsSync(keyPath)).toBe(true);
    expect(process.env['db-bigquery-email-bq_plain']).toBe(
      'sa@proj.iam.gserviceaccount.com',
    );
  });

  it('ducklake with s3 loads the s3 values into process.env', async () => {
    installDuckLakeInstances();
    const dir = makeTempProject();
    credentialStore.set('db-s3-region-dl_s3', 'eu-west-1');
    credentialStore.set('db-s3-access-key-dl_s3', 'AK');
    credentialStore.set('db-s3-secret-key-dl_s3', 'SK');
    await run(clone(FIXTURES.ducklake[0].conn), dir);
    expect(process.env['db-s3-region-dl_s3']).toBe('eu-west-1');
    expect(process.env['db-s3-access-key-dl_s3']).toBe('AK');
    expect(process.env['db-s3-secret-key-dl_s3']).toBe('SK');
    expect(process.env['db-s3-session-token-dl_s3']).toBeUndefined();
  });
});

describe('setConnectionEnvVariable characterization', () => {
  it('a bigquery key materializes a key file', async () => {
    await ConnectorsService.setConnectionEnvVariable(
      'db-bigquery-bq_env',
      JSON.stringify({ client_email: 'sa@x.iam.gserviceaccount.com' }),
    );
    expect(process.env['db-bigquery-bq_env']).toMatch(/rosetta-bigquery-/);
  });

  it('a bigquery key with invalid JSON throws', async () => {
    await expect(
      ConnectorsService.setConnectionEnvVariable('db-bigquery-x', 'not json'),
    ).rejects.toThrow('Invalid BigQuery service account key JSON format.');
  });

  it('any other key goes straight into process.env', async () => {
    await ConnectorsService.setConnectionEnvVariable('db-user-zzz', 'value');
    expect(process.env['db-user-zzz']).toBe('value');
    delete process.env['db-user-zzz'];
  });
});

describe('configureConnection characterization', () => {
  const configure = (connection: any) => {
    (ProjectsService.loadProjects as jest.Mock).mockResolvedValue([
      { id: 'p1', name: 'proj', path: '/nowhere' },
    ]);
    return ConnectorsService.configureConnection({
      projectId: 'p1',
      connection,
    } as any);
  };

  [
    ['mysql', 'MySQL connections cannot be used by dbt projects'],
    ['oracle', 'Oracle connections cannot be used by dbt projects'],
    ['sqlite', 'SQLite connections cannot be used by dbt projects'],
  ].forEach(([type, message]) => {
    it(`${type}: "${message}"`, async () => {
      await expect(configure(clone(FIXTURES[type][0].conn))).rejects.toThrow(
        message,
      );
    });
  });

  it('legacy db2: "db2 connections cannot be used by dbt projects"', async () => {
    await expect(configure(clone(LEGACY_DB2))).rejects.toThrow(
      'db2 connections cannot be used by dbt projects',
    );
  });
});
