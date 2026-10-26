import { RuleTester } from 'eslint';
import { CONNECTION_TYPES } from '../../../src/connections/registry.shared';
import { connectionDescriptors } from '../../../src/connections/registry.shared';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugin = require('../../../tools/eslint-plugin-studio');

const rule = plugin.rules['no-connection-type-branch'];
const tester = new RuleTester(<any>{
  parser: require.resolve('@typescript-eslint/parser'),
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
});

tester.run('no-connection-type-branch', rule, {
  valid: [
    "catalogType === 'sqlite'",
    "switch (currentSection) { case 'duckdb': break; }",
    "adapter === 'ducklake'",
    "({ duckdb: 1, ducklake: 2 })",
    "style === 'double'",
    {
      code: "if (conn.type === 'duckdb') {}",
      filename: '/repo/src/connections/x.ts',
    },
  ],
  invalid: [
    { code: "switch (connection.type) { case 'postgres': break; }", errors: 1 },
    { code: "if (conn.type === 'duckdb') {}", errors: 1 },
    { code: "connectionType !== 'ducklake'", errors: 1 },
    { code: "connectionTypeRef.current === 'oracle'", errors: 1 },
    { code: "connType === 'snowflake'", errors: 1 },
    { code: "switch (normalized) { case 'oracle': break; }", errors: 1 },
    { code: "switch (dialect) { case 'mysql': break; }", errors: 1 },
    { code: '({ postgres: 1, mysql: 2, sqlite: 3 })', errors: 1 },
    { code: "['mysql', 'sqlite', 'postgres']", errors: 1 },
  ],
});

describe('CONNECTION_TYPE_LITERALS', () => {
  it('equals the connection types plus every alias', () => {
    const aliases = Object.values(connectionDescriptors).flatMap(
      (d) => d.aliases ?? [],
    );
    expect([...plugin.CONNECTION_TYPE_LITERALS].sort()).toEqual(
      [...CONNECTION_TYPES, ...aliases].sort(),
    );
  });
});
