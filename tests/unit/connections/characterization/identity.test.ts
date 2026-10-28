import './mocks';
import ConnectorsService from '../../../../src/main/services/connectors.service';
import { ConnectionInput } from '../../../../src/types/backend';
import {
  ALL_TYPES,
  DBT_TYPES,
  FIXTURES,
  LEGACY_DB2,
  allFixtures,
} from './fixtures';

const svc = ConnectorsService as any;

describe('areConnectionConfigsEqual characterization', () => {
  allFixtures(ALL_TYPES).forEach(({ type, label, conn }) => {
    it(`${type} (${label}) equals a copy of itself`, () => {
      expect(svc.areConnectionConfigsEqual(conn, { ...conn })).toBe(true);
    });
  });

  const changes: [string, string, unknown][] = [
    ['postgres', 'host', 'other.example.com'],
    ['redshift', 'database', 'other'],
    ['snowflake', 'warehouse', 'OTHER'],
    ['bigquery', 'project', 'other-project'],
    ['databricks', 'httpPath', '/other'],
    ['duckdb', 'database_path', '/other.duckdb'],
    ['sqlite', 'database_path', '/other.sqlite'],
    ['kinetica', 'useSSL', true],
    ['mysql', 'ssl', false],
    ['oracle', 'username', 'someone_else'],
    ['ducklake', 'instanceId', 'other-instance'],
  ];
  changes.forEach(([type, field, value]) => {
    it(`${type} differs when ${field} changes`, () => {
      const base = FIXTURES[type][0].conn;
      expect(
        svc.areConnectionConfigsEqual(base, { ...base, [field]: value }),
      ).toBe(false);
    });
  });

  it('different types are never equal', () => {
    expect(
      svc.areConnectionConfigsEqual(
        FIXTURES.postgres[0].conn,
        FIXTURES.redshift[0].conn,
      ),
    ).toBe(false);
  });

  it('a legacy db2 row is never equal, even to itself', () => {
    expect(svc.areConnectionConfigsEqual(LEGACY_DB2, { ...LEGACY_DB2 })).toBe(
      false,
    );
  });
});

describe('generateUniqueConnectionName characterization', () => {
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(1700000000000));
  afterEach(() => jest.restoreAllMocks());

  allFixtures(ALL_TYPES).forEach(({ type, label, conn }) => {
    it(`${type} (${label})`, () => {
      expect(svc.generateUniqueConnectionName(conn)).toMatchSnapshot();
    });
  });

  it('legacy db2 falls back to the default base name', () => {
    expect(svc.generateUniqueConnectionName(LEGACY_DB2)).toBe(
      'DBT Connection_1700000000000',
    );
  });
});

describe('mapToDbtConnection characterization', () => {
  allFixtures(DBT_TYPES.filter((t) => t !== 'ducklake')).forEach(
    ({ type, label, conn }) => {
      it(`${type} (${label})`, () => {
        expect(svc.mapToDbtConnection(conn as ConnectionInput)).toMatchSnapshot();
      });
    },
  );
});
