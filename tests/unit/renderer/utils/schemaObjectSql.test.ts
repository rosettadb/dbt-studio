import {
  buildCountByColumnStatement,
  buildCountStatement,
  buildInsertTemplate,
  buildRenameColumnStatement,
  buildRenameTableStatement,
  buildSelectDistinctStatement,
  buildSelectStatement,
  formatColumnList,
  needsQuoting,
  qualifiedColumnName,
  qualifiedName,
  quoteIdentifier,
} from '../../../../src/renderer/utils/sql/schemaObjectSql';

const orders = { schema: 'sales', name: 'orders', columns: ['id', 'total'] };

describe('needsQuoting', () => {
  it('leaves simple identifiers bare', () => {
    expect(needsQuoting('orders', 'postgres')).toBe(false);
    expect(needsQuoting('order_items_2', 'mysql')).toBe(false);
    expect(needsQuoting('_private', undefined)).toBe(false);
  });

  it('quotes identifiers with special characters or leading digits', () => {
    expect(needsQuoting('my table', 'postgres')).toBe(true);
    expect(needsQuoting('order-items', 'duckdb')).toBe(true);
    expect(needsQuoting('2024_data', 'snowflake')).toBe(true);
    expect(needsQuoting('tbl.with.dots', 'postgres')).toBe(true);
  });

  it('quotes reserved words regardless of dialect', () => {
    expect(needsQuoting('order', 'postgres')).toBe(true);
    expect(needsQuoting('USER', 'mysql')).toBe(true);
    expect(needsQuoting('date', 'bigquery')).toBe(true);
  });

  it('respects case folding of the dialect', () => {
    // Postgres folds unquoted identifiers to lower case
    expect(needsQuoting('MyTable', 'postgres')).toBe(true);
    expect(needsQuoting('mytable', 'postgres')).toBe(false);
    // Snowflake / Oracle fold to upper case
    expect(needsQuoting('mytable', 'snowflake')).toBe(true);
    expect(needsQuoting('MYTABLE', 'snowflake')).toBe(false);
    expect(needsQuoting('Orders', 'oracle')).toBe(true);
    // Case-insensitive dialects never quote for case alone
    expect(needsQuoting('MyTable', 'mysql')).toBe(false);
    expect(needsQuoting('MyTable', 'duckdb')).toBe(false);
    expect(needsQuoting('MyTable', 'ducklake')).toBe(false);
  });

  it('treats an unknown dialect like the default (double quotes, no folding)', () => {
    expect(needsQuoting('MyTable', 'something-new')).toBe(false);
    expect(quoteIdentifier('my table', 'something-new')).toBe('"my table"');
  });
});

describe('quoteIdentifier', () => {
  it('uses the dialect quote character', () => {
    expect(quoteIdentifier('my table', 'postgres')).toBe('"my table"');
    expect(quoteIdentifier('my table', 'mysql')).toBe('`my table`');
    expect(quoteIdentifier('my table', 'bigquery')).toBe('`my table`');
    expect(quoteIdentifier('my table', 'mssql')).toBe('[my table]');
  });

  it('escapes embedded quote characters', () => {
    expect(quoteIdentifier('we"ird', 'postgres')).toBe('"we""ird"');
    expect(quoteIdentifier('we`ird', 'mysql')).toBe('`we``ird`');
    expect(quoteIdentifier('we]ird', 'mssql')).toBe('[we]]ird]');
  });

  it('supports forced quoting', () => {
    expect(quoteIdentifier('orders', 'postgres', { force: true })).toBe(
      '"orders"',
    );
  });

  it('returns empty input unchanged', () => {
    expect(quoteIdentifier('', 'postgres')).toBe('');
  });
});

describe('qualifiedName / qualifiedColumnName', () => {
  it('joins schema and table, quoting each part as needed', () => {
    expect(qualifiedName(orders, 'postgres')).toBe('sales.orders');
    expect(
      qualifiedName({ schema: 'My Schema', name: 'order' }, 'postgres'),
    ).toBe('"My Schema"."order"');
  });

  it('omits the schema when empty or when asked to', () => {
    expect(qualifiedName({ schema: '', name: 'orders' }, 'sqlite')).toBe(
      'orders',
    );
    expect(qualifiedName(orders, 'postgres', { includeSchema: false })).toBe(
      'orders',
    );
  });

  it('builds fully qualified column names', () => {
    expect(qualifiedColumnName(orders, 'total', 'postgres')).toBe(
      'sales.orders.total',
    );
    expect(qualifiedColumnName(orders, 'order', 'mssql')).toBe(
      'sales.orders.[order]',
    );
  });

  it('formats column lists', () => {
    expect(formatColumnList(['id', 'order', 'x y'], 'postgres')).toBe(
      'id, "order", "x y"',
    );
  });
});

describe('buildSelectStatement', () => {
  it('defaults to SELECT * with LIMIT 100', () => {
    expect(buildSelectStatement(orders, 'postgres')).toBe(
      'SELECT *\nFROM sales.orders\nLIMIT 100;',
    );
  });

  it('lists columns one per line', () => {
    expect(
      buildSelectStatement(orders, 'duckdb', { columns: ['id', 'total'] }),
    ).toBe('SELECT\n  id,\n  total\nFROM sales.orders\nLIMIT 100;');
  });

  it('uses TOP for SQL Server', () => {
    expect(buildSelectStatement(orders, 'mssql', { limit: 50 })).toBe(
      'SELECT TOP 50 *\nFROM sales.orders;',
    );
    expect(
      buildSelectStatement(orders, 'mssql', { columns: ['id'], limit: 5 }),
    ).toBe('SELECT TOP 5\n  id\nFROM sales.orders;');
  });

  it('uses FETCH FIRST for Oracle and DB2', () => {
    // Oracle folds bare identifiers to upper case, so lower-case names are quoted
    expect(buildSelectStatement(orders, 'oracle', { limit: 10 })).toBe(
      'SELECT *\nFROM "sales"."orders"\nFETCH FIRST 10 ROWS ONLY;',
    );
    expect(buildSelectStatement({ schema: 'S', name: 'T' }, 'db2')).toBe(
      'SELECT *\nFROM S.T\nFETCH FIRST 100 ROWS ONLY;',
    );
  });

  it('omits the limit clause when limit is null', () => {
    expect(buildSelectStatement(orders, 'postgres', { limit: null })).toBe(
      'SELECT *\nFROM sales.orders;',
    );
    expect(buildSelectStatement(orders, 'mssql', { limit: null })).toBe(
      'SELECT *\nFROM sales.orders;',
    );
  });
});

describe('other generators', () => {
  it('builds COUNT statements', () => {
    expect(buildCountStatement(orders, 'postgres')).toBe(
      'SELECT COUNT(*) AS total_rows\nFROM sales.orders;',
    );
  });

  it('builds INSERT templates with placeholder comments', () => {
    expect(buildInsertTemplate(orders, 'postgres')).toBe(
      'INSERT INTO sales.orders (id, total)\nVALUES (\n  ?, -- id\n  ?  -- total\n);',
    );
    expect(buildInsertTemplate({ schema: 's', name: 't' }, 'postgres')).toBe(
      'INSERT INTO s.t\nVALUES (?);',
    );
  });

  it('builds SELECT DISTINCT statements', () => {
    expect(buildSelectDistinctStatement(orders, 'total', 'postgres')).toBe(
      'SELECT DISTINCT total\nFROM sales.orders\nLIMIT 100;',
    );
    expect(buildSelectDistinctStatement(orders, 'total', 'mssql', 20)).toBe(
      'SELECT DISTINCT TOP 20 total\nFROM sales.orders;',
    );
  });

  it('builds COUNT BY column statements', () => {
    expect(buildCountByColumnStatement(orders, 'order', 'postgres')).toBe(
      'SELECT\n  "order",\n  COUNT(*) AS total_rows\nFROM sales.orders\nGROUP BY "order"\nORDER BY total_rows DESC;',
    );
  });

  it('builds dialect specific table renames', () => {
    expect(buildRenameTableStatement(orders, 'orders_v2', 'postgres')).toBe(
      'ALTER TABLE sales.orders RENAME TO orders_v2;',
    );
    expect(buildRenameTableStatement(orders, 'orders_v2', 'mysql')).toBe(
      'RENAME TABLE sales.orders TO sales.orders_v2;',
    );
    expect(buildRenameTableStatement(orders, "o'2", 'mssql')).toBe(
      "EXEC sp_rename 'sales.orders', 'o''2';",
    );
  });

  it('builds dialect specific column renames', () => {
    expect(
      buildRenameColumnStatement(orders, 'total', 'amount', 'postgres'),
    ).toBe('ALTER TABLE sales.orders RENAME COLUMN total TO amount;');
    expect(buildRenameColumnStatement(orders, 'total', 'amount', 'mssql')).toBe(
      "EXEC sp_rename 'sales.orders.total', 'amount', 'COLUMN';",
    );
  });
});
