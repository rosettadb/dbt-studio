import './mocks';
import fs from 'fs';
import path from 'path';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { installDuckLakeInstances } from './duckLakeFixtures';
import { updateMainConf } from '../../../../src/main/utils/yamlPartialUpdate';
import {
  DBT_TYPES,
  allFixtures,
  cleanTempProjects,
  makeTempProject,
} from './fixtures';

const svc = ConnectorsService as any;

const project = {
  id: 'p1',
  name: 'proj',
  path: '/projects/proj',
  rosettaPath: '/projects/proj/rosetta',
} as any;

const DIFF_TAGS: Record<string, string> = {
  'postgres:ssl on, reject unauthorized false': 'DIFF-1',
  'redshift:ssl on with sslrootcert': 'DIFF-2',
  'databricks:default': 'DIFF-5',
  'duckdb:absolute path with short_database_path': 'DIFF-6',
  'duckdb:without short_database_path': 'DIFF-6',
};

describe('rosetta generation characterization', () => {
  beforeEach(() => {
    installDuckLakeInstances();
  });
  afterEach(() => {
    cleanTempProjects();
    jest.restoreAllMocks();
  });

  allFixtures(DBT_TYPES).forEach(({ type, label, conn }) => {
    it(`${type} (${label}): generateJdbcUrl`, async () => {
      let value: unknown;
      try {
        value = await ConnectorsService.generateJdbcUrl(conn);
      } catch (e) {
        value = { error: (e as Error).message };
      }
      expect(value).toMatchSnapshot();
    });

    it(`${type} (${label}): generateRosettaYml`, async () => {
      let value: unknown;
      try {
        value = await ConnectorsService.generateRosettaYml(conn, 'proj');
      } catch (e) {
        value = { error: (e as Error).message };
      }
      expect(value).toMatchSnapshot();
      expect(JSON.stringify(value)).not.toContain('FIXTURE-SECRET');
    });

    it(`${type} (${label}): mapToRosettaConnection`, async () => {
      let value: unknown;
      try {
        value = await svc.mapToRosettaConnection(conn, project);
      } catch (e) {
        value = { error: (e as Error).message };
      }
      expect(value).toMatchSnapshot();
    });
  });

  allFixtures(DBT_TYPES.filter((t) => t !== 'ducklake')).forEach(
    ({ type, label, conn }) => {
      it(`${type} (${label}): updateMainConf entry`, async () => {
        const dir = makeTempProject();
        fs.mkdirSync(path.join(dir, 'rosetta'));
        let full: string;
        try {
          full = await ConnectorsService.generateRosettaYml(conn, 'proj');
        } catch (e) {
          // DIFF-6: the full path throws without short_database_path. Seed the
          // file from a sibling connection so the partial path still runs.
          full = `ERROR: ${(e as Error).message}`;
          fs.writeFileSync(
            path.join(dir, 'rosetta', 'main.conf'),
            await ConnectorsService.generateRosettaYml(
              { ...conn, short_database_path: 'warehouse.duckdb' } as any,
              'proj',
            ),
          );
        }
        if (!full.startsWith('ERROR')) {
          const tag1 = DIFF_TAGS[`${type}:${label}`];
          const seed =
            tag1 === 'DIFF-1' || tag1 === 'DIFF-2'
              ? await ConnectorsService.generateRosettaYml(
                  { ...conn, ssl: false } as any,
                  'proj',
                )
              : full;
          fs.writeFileSync(path.join(dir, 'rosetta', 'main.conf'), seed);
        }
        let after: string;
        try {
          await updateMainConf(dir, 'proj', conn);
          after = fs.readFileSync(path.join(dir, 'rosetta', 'main.conf'), 'utf8');
        } catch (e) {
          after = `ERROR: ${(e as Error).message}`;
        }
        const tag = DIFF_TAGS[`${type}:${label}`];
        // DIFF-1, -2, -5, -6 are recorded as today's output (a snapshot).
        expect({ tag: tag ?? null, full, after }).toMatchSnapshot();
      });
    },
  );
});
