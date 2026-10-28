import './mocks';
import { buildDialectHints } from '../../../../src/main/services/ai/agents/notebooksAgent.prompts';
import LineageService from '../../../../src/main/services/lineage.service';
import { canUseAsDbtConnection } from '../../../../src/types/backend';

describe('buildDialectHints characterization', () => {
  [
    'postgres',
    'postgresql',
    'redshift',
    'snowflake',
    'bigquery',
    'databricks',
    'duckdb',
    'ducklake',
    'kinetica',
    'oracle',
    'mysql',
    'sqlite',
    'db2',
  ].forEach((type) => {
    it(type, () => {
      const hint = buildDialectHints({ type } as any).replace(
        /DuckDB v[\d.]+\+?/g,
        'DuckDB v<version>',
      );
      expect(hint).toMatchSnapshot();
    });
  });
});

describe('mapAdapterToSqlParserDialect characterization', () => {
  const map = (a?: string) =>
    (LineageService as any).mapAdapterToSqlParserDialect(a);
  [
    'snowflake',
    'bigquery',
    'databricks',
    'redshift',
    'postgres',
    'postgresql',
    'oracle',
    'kinetica',
    'duckdb',
    'sqlite',
    'mysql',
    'ducklake',
    ' Snowflake ',
    '',
    undefined,
  ].forEach((adapter) => {
    it(`${JSON.stringify(adapter)}`, () => {
      expect(map(adapter)).toMatchSnapshot();
    });
  });
});

describe('canUseAsDbtConnection characterization', () => {
  const types: [string, boolean][] = [
    ['postgres', true],
    ['snowflake', true],
    ['bigquery', true],
    ['redshift', true],
    ['databricks', true],
    ['kinetica', true],
    ['duckdb', true],
    ['ducklake', true],
    // C3 drops the never-implemented placeholders (no longer types).
    ['mssql', false],
    ['googlecloud', false],
    ['sqlite', false],
    ['mysql', false],
    ['oracle', false],
    ['db2', false],
    ['constructor', false],
    ['', false],
  ];
  types.forEach(([type, expected]) => {
    it(`${JSON.stringify(type)} -> ${expected}`, () => {
      expect(canUseAsDbtConnection(type)).toBe(expected);
    });
  });
});
