/**
 * Turns a list of tables into the boxes (tables) and lines (relationships)
 * of an ER diagram. Pure on purpose so it can be unit tested.
 *
 * A line comes from a real foreign key when the connector reports one.
 * Otherwise it is guessed from the column name: `customer_id` (or
 * `customerId`) points at a table named `customer` or its plural
 * (`customers`, `addresses`, `categories`), on that table's primary key,
 * `id`, or a column with the same name. Data lakes like DuckLake have no keys at all,
 * so for them every line is a guess.
 *
 * A guess is dropped rather than risk a wrong line when both columns hold
 * different kinds of data (a number can't point at a text code), or when
 * two tables fit the name (`customer` and `customers`).
 */

export type ErColumnInput = {
  name: string;
  typeName: string;
  primaryKey?: boolean;
  foreignKeys?: Array<{
    primaryTableSchema: string;
    primaryTableName: string;
    primaryColumnName: string;
  }>;
};

export type ErTableInput = {
  name: string;
  schema: string;
  type?: string;
  columns: ErColumnInput[];
};

export type ErColumn = {
  name: string;
  typeName: string;
  isPrimaryKey: boolean;
  /** Points at another table, by a real or guessed relationship. */
  isForeignKey: boolean;
};

export type ErTable = {
  id: string;
  name: string;
  schema: string;
  isView: boolean;
  columns: ErColumn[];
};

export type ErRelationship = {
  id: string;
  /** The table that is pointed at (holds the key). */
  parentTableId: string;
  parentColumn: string;
  /** The table whose column points at the parent. */
  childTableId: string;
  childColumn: string;
  /** True when guessed from column names, false for a real foreign key. */
  inferred: boolean;
};

export type ErGraph = {
  tables: ErTable[];
  relationships: ErRelationship[];
};

export const erTableId = (schema: string, name: string) => `${schema}.${name}`;

/** `customer_id` / `customerId` → `customer`; anything else → null. */
const referencedNameFromColumn = (columnName: string): string | null => {
  const snake = /^(.+)_id$/i.exec(columnName);
  if (snake) return snake[1].toLowerCase();
  const camel = /^(.+[a-z0-9])Id$/.exec(columnName);
  if (camel) return camel[1].toLowerCase();
  return null;
};

const candidateTableNames = (base: string): string[] => {
  const names = [base, `${base}s`, `${base}es`];
  if (base.endsWith('y')) names.push(`${base.slice(0, -1)}ies`);
  return names;
};

/** The column a guessed relationship points at, or null when there is none. */
const findReferencedColumn = (
  target: ErTableInput,
  childColumnName: string,
): ErColumnInput | null => {
  const primaryKeys = target.columns.filter((c) => c.primaryKey);
  if (primaryKeys.length === 1) return primaryKeys[0];
  const byName = (name: string) =>
    target.columns.find((c) => c.name.toLowerCase() === name.toLowerCase());
  return byName('id') ?? byName(childColumnName) ?? null;
};

/**
 * The kind of data a column type holds, across databases (`INTEGER`,
 * `int64`, `bigint`, `NUMBER(10)` are all numbers). Null when the type is
 * missing or not one of these, which never blocks a guess.
 */
const typeKind = (typeName: string): string | null => {
  const type = typeName.toLowerCase().trim();
  // Lists and records first: INTEGER[] holds many numbers, not one, and
  // Postgres reports any array column as just "ARRAY".
  if (/\[\]|^(array|list|struct|map|union|object|variant)\b/.test(type)) {
    return 'container';
  }
  // Before numbers: "interval" and "point" contain "int".
  if (/date|time|interval/.test(type)) return 'date';
  if (/point|geometry|geography|polygon|linestring/.test(type)) {
    return 'geometry';
  }
  if (/uuid|uniqueidentifier/.test(type)) return 'uuid';
  if (/char|text|string|clob|enum/.test(type)) return 'text';
  if (/bool/.test(type)) return 'boolean';
  if (/int|serial|numeric|decimal|number|float|double|real/.test(type)) {
    return 'number';
  }
  return null;
};

const sameKindOfData = (a: string, b: string) => {
  const kindA = typeKind(a);
  const kindB = typeKind(b);
  return kindA === null || kindB === null || kindA === kindB;
};

export const buildErGraph = (tables: ErTableInput[]): ErGraph => {
  const tableById = new Map<string, ErTableInput>();
  // Lower-case name → every table with it, for guessing. Postgres allows
  // `customers` next to `"Customers"`, and then a guess would be a coin toss.
  const tablesByLowerName = new Map<string, ErTableInput[]>();
  tables.forEach((table) => {
    tableById.set(erTableId(table.schema, table.name), table);
    const lower = table.name.toLowerCase();
    tablesByLowerName.set(lower, [
      ...(tablesByLowerName.get(lower) ?? []),
      table,
    ]);
  });

  const relationships: ErRelationship[] = [];
  const seenRelationshipIds = new Set<string>();
  // Columns that point at another table, as `tableId\0column`.
  const foreignKeyColumns = new Set<string>();

  const addRelationship = (relationship: Omit<ErRelationship, 'id'>) => {
    // A list, not dots: names can contain dots ("a.b".c vs a."b.c").
    const id = JSON.stringify([
      relationship.childTableId,
      relationship.childColumn,
      relationship.parentTableId,
      relationship.parentColumn,
    ]);
    if (seenRelationshipIds.has(id)) return;
    seenRelationshipIds.add(id);
    relationships.push({ id, ...relationship });
    foreignKeyColumns.add(
      `${relationship.childTableId}\0${relationship.childColumn}`,
    );
  };

  tables.forEach((table) => {
    const childTableId = erTableId(table.schema, table.name);

    table.columns.forEach((column) => {
      // Only keys whose table and column are in the diagram can be drawn.
      const realKeys = (column.foreignKeys ?? []).filter((fk) =>
        tableById
          .get(erTableId(fk.primaryTableSchema, fk.primaryTableName))
          ?.columns.some((c) => c.name === fk.primaryColumnName),
      );
      if (realKeys.length > 0) {
        realKeys.forEach((fk) =>
          addRelationship({
            parentTableId: erTableId(
              fk.primaryTableSchema,
              fk.primaryTableName,
            ),
            parentColumn: fk.primaryColumnName,
            childTableId,
            childColumn: column.name,
            inferred: false,
          }),
        );
        return;
      }
      // A real key whose table isn't in this diagram (another schema) still
      // says where the column points, so a name guess could only contradict it.
      if ((column.foreignKeys ?? []).length > 0) return;

      const base = referencedNameFromColumn(column.name);
      if (!base) return;
      const candidates = candidateTableNames(base).flatMap(
        (name) => tablesByLowerName.get(name) ?? [],
      );
      // A table's own `customer_id` key is not a line to itself, and with
      // two tables to choose from (`customer`, `customers`) any pick is a
      // coin toss.
      if (candidates.length !== 1 || candidates[0] === table) return;
      const target = candidates[0];
      const parentColumn = findReferencedColumn(target, column.name);
      if (!parentColumn) return;
      if (!sameKindOfData(column.typeName, parentColumn.typeName)) return;

      addRelationship({
        parentTableId: erTableId(target.schema, target.name),
        parentColumn: parentColumn.name,
        childTableId,
        childColumn: column.name,
        inferred: true,
      });
    });
  });

  const erTables: ErTable[] = tables.map((table) => {
    const id = erTableId(table.schema, table.name);
    return {
      id,
      name: table.name,
      schema: table.schema,
      isView: (table.type ?? '').toUpperCase().includes('VIEW'),
      columns: table.columns.map((column) => ({
        name: column.name,
        typeName: column.typeName,
        isPrimaryKey: !!column.primaryKey,
        isForeignKey: foreignKeyColumns.has(`${id}\0${column.name}`),
      })),
    };
  });

  return { tables: erTables, relationships };
};

/**
 * Only one table, the tables it points at and the tables pointing at it,
 * with the lines that touch it. Used on a single table's page.
 */
export const relatedTablesGraph = (
  graph: ErGraph,
  tableId: string,
): ErGraph => {
  const relationships = graph.relationships.filter(
    (r) => r.parentTableId === tableId || r.childTableId === tableId,
  );
  const keptIds = new Set<string>([tableId]);
  // 🔗 only on columns whose line is still drawn.
  const keptForeignKeys = new Set<string>();
  relationships.forEach((r) => {
    keptIds.add(r.parentTableId);
    keptIds.add(r.childTableId);
    keptForeignKeys.add(`${r.childTableId}\0${r.childColumn}`);
  });
  return {
    tables: graph.tables
      .filter((t) => keptIds.has(t.id))
      .map((t) => ({
        ...t,
        columns: t.columns.map((c) => ({
          ...c,
          isForeignKey: keptForeignKeys.has(`${t.id}\0${c.name}`),
        })),
      })),
    relationships,
  };
};
