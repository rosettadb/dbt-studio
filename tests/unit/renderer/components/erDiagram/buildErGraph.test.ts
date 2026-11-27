import {
  buildErGraph,
  relatedTablesGraph,
  type ErColumnInput,
  type ErTableInput,
} from '../../../../../src/renderer/components/erDiagram/buildErGraph';
import {
  duckLakeErTables,
  duckLakeSchemaNames,
} from '../../../../../src/renderer/components/erDiagram/duckLakeErTables';

const col = (name: string, extra: Partial<ErColumnInput> = {}) => ({
  name,
  typeName: 'INTEGER',
  ...extra,
});

const table = (
  name: string,
  columns: ErColumnInput[],
  extra: Partial<ErTableInput> = {},
): ErTableInput => ({ name, schema: 'main', columns, ...extra });

const lines = (tables: ErTableInput[]) =>
  buildErGraph(tables).relationships.map(
    (r) =>
      `${r.childTableId}.${r.childColumn} -> ${r.parentTableId}.${r.parentColumn}${r.inferred ? ' (name)' : ''}`,
  );

describe('buildErGraph: matching by column name', () => {
  it('links snake_case and camelCase columns to singular and plural tables', () => {
    expect(
      lines([
        table('customer', [col('id')]),
        table('orders', [col('id')]),
        table('addresses', [col('id')]),
        table('categories', [col('id')]),
        table('items', [
          col('customer_id'),
          col('orderId'),
          col('address_id'),
          col('category_id'),
        ]),
      ]),
    ).toEqual([
      'main.items.customer_id -> main.customer.id (name)',
      'main.items.orderId -> main.orders.id (name)',
      'main.items.address_id -> main.addresses.id (name)',
      'main.items.category_id -> main.categories.id (name)',
    ]);
  });

  it('points at the primary key, then id, then a column with the same name', () => {
    expect(
      lines([
        table('customers', [col('code', { primaryKey: true }), col('id')]),
        table('products', [col('sku'), col('id')]),
        table('departments', [col('department_id'), col('name')]),
        table('facts', [
          col('customer_id'),
          col('product_id'),
          col('department_id'),
        ]),
      ]),
    ).toEqual([
      'main.facts.customer_id -> main.customers.code (name)',
      'main.facts.product_id -> main.products.id (name)',
      'main.facts.department_id -> main.departments.department_id (name)',
    ]);
  });

  it('draws no line for a table pointing at itself, a missing table, or a table without a key column', () => {
    expect(
      lines([
        table('customers', [col('customer_id', { primaryKey: true })]),
        table('tags', [col('label')]),
        table('tickets', [col('owner_id'), col('tag_id'), col('id')]),
        table('logs', [col('valid'), col('paid')]),
      ]),
    ).toEqual([]);
  });

  it('draws no line between columns holding different kinds of data', () => {
    expect(
      lines([
        table('departments', [
          col('code', { primaryKey: true, typeName: 'VARCHAR' }),
        ]),
        table('countries', [col('id', { typeName: 'INTEGER' })]),
        table('events', [col('id', { typeName: 'TIMESTAMP' })]),
        table('locations', [col('id', { typeName: 'INTEGER' })]),
        table('people', [
          col('department_id', { typeName: 'INTEGER' }),
          col('country_id', { typeName: 'character varying(2)' }),
          col('event_id', { typeName: 'BIGINT' }),
          // "point" contains "int" but is a map point, not a number.
          col('location_id', { typeName: 'POINT' }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('matches number types of any size and spelling, and unknown types', () => {
    expect(
      lines([
        table('customers', [col('id', { typeName: 'int32' })]),
        table('products', [col('id', { typeName: 'NUMBER(38,0)' })]),
        table('stores', [col('id', { typeName: 'UNKNOWN' })]),
        table('codes', [col('id', { typeName: 'VARCHAR(10)' })]),
        table('sales', [
          col('customer_id', { typeName: 'BIGINT' }),
          col('product_id', { typeName: 'integer' }),
          col('store_id', { typeName: 'TEXT' }),
          col('code_id', { typeName: 'text' }),
        ]),
      ]),
    ).toEqual([
      'main.sales.customer_id -> main.customers.id (name)',
      'main.sales.product_id -> main.products.id (name)',
      'main.sales.store_id -> main.stores.id (name)',
      'main.sales.code_id -> main.codes.id (name)',
    ]);
  });

  it('never matches a list or record column to a plain one', () => {
    expect(
      lines([
        table('customers', [col('id', { typeName: 'INTEGER' })]),
        table('products', [col('id', { typeName: 'INTEGER' })]),
        table('stores', [col('id', { typeName: 'BIGINT' })]),
        table('sales', [
          col('customer_id', { typeName: 'INTEGER[]' }),
          // Postgres reports every array column as just ARRAY.
          col('product_id', { typeName: 'ARRAY' }),
          col('store_id', { typeName: 'STRUCT(id BIGINT)' }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('matches list columns only to the exact same list type', () => {
    expect(
      lines([
        table('customers', [col('id', { typeName: 'INTEGER[]' })]),
        table('products', [col('id', { typeName: 'INTEGER[]' })]),
        table('sales', [
          col('customer_id', { typeName: 'VARCHAR[]' }),
          col('product_id', { typeName: 'integer []' }),
        ]),
      ]),
    ).toEqual(['main.sales.product_id -> main.products.id (name)']);
  });

  it('draws no line when two tables differ only in case', () => {
    expect(
      lines([
        table('customers', [col('id')]),
        table('Customers', [col('id')]),
        table('sales', [col('customer_id')]),
      ]),
    ).toEqual([]);
  });

  it('keeps lines apart when names contain dots', () => {
    const toParents = [
      {
        primaryTableSchema: 'main',
        primaryTableName: 'parents',
        primaryColumnName: 'id',
      },
    ];
    expect(
      buildErGraph([
        table('parents', [col('id')]),
        table('a.b', [col('c', { foreignKeys: toParents })]),
        table('a', [col('b.c', { foreignKeys: toParents })]),
      ]).relationships,
    ).toHaveLength(2);
  });

  it('draws no line when two tables fit the name', () => {
    expect(
      lines([
        table('customer', [col('id')]),
        table('customers', [col('id')]),
        table('sales', [col('customer_id')]),
      ]),
    ).toEqual([]);
  });

  it('marks only the pointing column as a link', () => {
    const graph = buildErGraph([
      table('customers', [col('id', { primaryKey: true })]),
      table('orders', [col('id'), col('customer_id')], { type: 'VIEW' }),
    ]);
    const orders = graph.tables.find((t) => t.name === 'orders')!;
    const customers = graph.tables.find((t) => t.name === 'customers')!;

    expect(orders.isView).toBe(true);
    expect(customers.isView).toBe(false);
    expect(orders.columns.map((c) => c.isForeignKey)).toEqual([false, true]);
    expect(customers.columns[0]).toMatchObject({
      isPrimaryKey: true,
      isForeignKey: false,
    });
  });
});

describe('buildErGraph: real foreign keys', () => {
  const fk = (
    primaryTableName: string,
    primaryColumnName: string,
    primaryTableSchema = 'main',
  ) => ({ primaryTableSchema, primaryTableName, primaryColumnName });

  it('draws real keys and prefers them over a name match', () => {
    expect(
      lines([
        table('customers', [col('id')]),
        table('buyers', [col('id')]),
        table('orders', [
          // The name says customers, the key says buyers: the key wins.
          col('customer_id', { foreignKeys: [fk('buyers', 'id')] }),
        ]),
      ]),
    ).toEqual(['main.orders.customer_id -> main.buyers.id']);
  });

  it('never guesses for a column whose real key points outside the diagram', () => {
    expect(
      lines([
        // A same-named table here, but the key says auth.users.
        table('users', [col('id')]),
        table('orders', [
          col('user_id', { foreignKeys: [fk('users', 'id', 'auth')] }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('draws real keys whatever the column types', () => {
    expect(
      lines([
        table('regions', [col('code', { typeName: 'VARCHAR' })]),
        table('shops', [
          col('region_ref', {
            typeName: 'INTEGER',
            foreignKeys: [fk('regions', 'code')],
          }),
        ]),
      ]),
    ).toEqual(['main.shops.region_ref -> main.regions.code']);
  });

  it('ignores keys to tables or columns not in the diagram', () => {
    expect(
      lines([
        table('customers', [col('id')]),
        table('orders', [
          col('note_id', { foreignKeys: [fk('notes', 'id')] }),
          col('customer_ref', { foreignKeys: [fk('customers', 'uuid')] }),
          col('region_id', { foreignKeys: [fk('regions', 'id', 'geo')] }),
        ]),
      ]),
    ).toEqual([]);
  });

  it('draws each column of a key over several columns once', () => {
    expect(
      lines([
        table('orders', [col('id'), col('line')]),
        table('returns', [
          col('order_ref', {
            foreignKeys: [fk('orders', 'id'), fk('orders', 'id')],
          }),
          col('line_ref', { foreignKeys: [fk('orders', 'line')] }),
        ]),
      ]),
    ).toEqual([
      'main.returns.order_ref -> main.orders.id',
      'main.returns.line_ref -> main.orders.line',
    ]);
  });
});

describe('relatedTablesGraph', () => {
  const graph = buildErGraph([
    table('customers', [col('id')]),
    table('categories', [col('id')]),
    table('products', [col('id'), col('category_id')]),
    table('orders', [col('id'), col('customer_id')]),
    table('order_items', [col('order_id'), col('product_id')]),
    table('audit_log', [col('event')]),
  ]);

  it('keeps the table, the tables it points at and the tables pointing at it', () => {
    const related = relatedTablesGraph(graph, 'main.orders');

    // Tables keep the order they came in.
    expect(related.tables.map((t) => t.name)).toEqual([
      'customers',
      'orders',
      'order_items',
    ]);
    expect(related.relationships).toHaveLength(2);
  });

  it('shows the link icon only on columns whose line is drawn', () => {
    const related = relatedTablesGraph(graph, 'main.orders');
    const orderItems = related.tables.find((t) => t.name === 'order_items')!;

    expect(orderItems.columns.map((c) => [c.name, c.isForeignKey])).toEqual([
      ['order_id', true],
      ['product_id', false],
    ]);
  });

  it('keeps a table with no links on its own', () => {
    const related = relatedTablesGraph(graph, 'main.audit_log');

    expect(related.tables.map((t) => t.name)).toEqual(['audit_log']);
    expect(related.relationships).toEqual([]);
  });
});

describe('duckLakeErTables', () => {
  it('turns every schema and table into diagram tables', () => {
    expect(
      duckLakeErTables({
        schemas: [
          {
            name: 'main',
            tables: [
              {
                name: 'orders',
                type: 'TABLE',
                columns: [{ name: 'id', type: 'BIGINT', position: 1 }],
              },
            ],
          },
          { name: 'empty', tables: [] },
        ],
        functions: [],
        systemTables: [],
      }),
    ).toEqual([
      {
        name: 'orders',
        schema: 'main',
        type: 'TABLE',
        columns: [{ name: 'id', typeName: 'BIGINT' }],
      },
    ]);
  });

  it('gives no tables before the schema has loaded', () => {
    expect(duckLakeErTables(undefined)).toEqual([]);
  });

  it('lists every schema name, also the empty ones', () => {
    expect(
      duckLakeSchemaNames({
        schemas: [
          { name: 'main', tables: [] },
          { name: 'staging', tables: [] },
        ],
        functions: [],
        systemTables: [],
      }),
    ).toEqual(['main', 'staging']);
    expect(duckLakeSchemaNames(undefined)).toEqual([]);
  });
});
