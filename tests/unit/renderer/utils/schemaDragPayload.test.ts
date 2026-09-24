import {
  SCHEMA_OBJECT_MIME,
  buildDragSelectStatement,
  buildDragText,
  hasSchemaDragData,
  readSchemaDragData,
  setSchemaDragData,
  type DataTransferLike,
  type SchemaDragPayload,
} from '../../../../src/renderer/utils/sql/schemaDragPayload';

class FakeDataTransfer implements DataTransferLike {
  private data = new Map<string, string>();

  effectAllowed = 'uninitialized';

  dropEffect = 'none';

  get types(): string[] {
    return Array.from(this.data.keys());
  }

  setData(format: string, value: string) {
    this.data.set(format, value);
  }

  getData(format: string) {
    return this.data.get(format) ?? '';
  }
}

const tablePayload: SchemaDragPayload = {
  version: 1,
  kind: 'table',
  connectionId: 'conn-1',
  connectionType: 'postgres',
  schema: 'sales',
  table: 'orders',
  columns: ['id', 'order'],
};

describe('buildDragText', () => {
  it('returns a qualified table name for tables and views', () => {
    expect(buildDragText(tablePayload)).toBe('sales.orders');
    expect(buildDragText({ ...tablePayload, kind: 'view' })).toBe(
      'sales.orders',
    );
  });

  it('returns the bare column name for columns', () => {
    expect(
      buildDragText({ ...tablePayload, kind: 'column', column: 'order' }),
    ).toBe('"order"');
  });

  it('returns the schema name for schemas', () => {
    expect(
      buildDragText({ version: 1, kind: 'schema', schema: 'My Schema' }),
    ).toBe('"My Schema"');
  });
});

describe('buildDragSelectStatement', () => {
  it('expands tables into a SELECT with their columns', () => {
    expect(buildDragSelectStatement(tablePayload)).toBe(
      'SELECT\n  id,\n  "order"\nFROM sales.orders\nLIMIT 100;',
    );
  });

  it('falls back to plain text for columns', () => {
    expect(
      buildDragSelectStatement({
        ...tablePayload,
        kind: 'column',
        column: 'id',
      }),
    ).toBe('id');
  });
});

describe('setSchemaDragData / readSchemaDragData', () => {
  it('round-trips the payload and writes plain text alongside', () => {
    const dt = new FakeDataTransfer();
    setSchemaDragData(dt, tablePayload);

    expect(dt.effectAllowed).toBe('copy');
    expect(dt.getData('text/plain')).toBe('sales.orders');
    expect(hasSchemaDragData(dt)).toBe(true);
    expect(readSchemaDragData(dt)).toEqual(tablePayload);
  });

  it('ignores transfers without the custom MIME', () => {
    const dt = new FakeDataTransfer();
    dt.setData('text/plain', 'sales.orders');

    expect(hasSchemaDragData(dt)).toBe(false);
    expect(readSchemaDragData(dt)).toBeNull();
    expect(hasSchemaDragData(null)).toBe(false);
    expect(readSchemaDragData(undefined)).toBeNull();
  });

  it('rejects malformed payloads', () => {
    const dt = new FakeDataTransfer();
    dt.setData(SCHEMA_OBJECT_MIME, '{not json');
    expect(readSchemaDragData(dt)).toBeNull();

    dt.setData(SCHEMA_OBJECT_MIME, JSON.stringify({ version: 2, kind: 'x' }));
    expect(readSchemaDragData(dt)).toBeNull();

    dt.setData(SCHEMA_OBJECT_MIME, JSON.stringify({ version: 1 }));
    expect(readSchemaDragData(dt)).toBeNull();
  });

  it('supports DOMStringList-style types', () => {
    const list = {
      contains: (mime: string) => mime === SCHEMA_OBJECT_MIME,
      length: 1,
      item: () => SCHEMA_OBJECT_MIME,
    } as unknown as DOMStringList;
    const dt: DataTransferLike = {
      types: list,
      setData: () => {},
      getData: () => JSON.stringify(tablePayload),
    };
    expect(hasSchemaDragData(dt)).toBe(true);
    expect(readSchemaDragData(dt)).toEqual(tablePayload);
  });
});
