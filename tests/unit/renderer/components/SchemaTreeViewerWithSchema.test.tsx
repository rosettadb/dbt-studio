import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import { SchemaTreeViewerWithSchema } from '../../../../src/renderer/screens/sql/SchemaTreeViewerWithSchema';
import { SCHEMA_OBJECT_MIME } from '../../../../src/renderer/utils/sql/schemaDragPayload';
import type { Table } from '../../../../src/types/backend';

jest.mock('../../../../src/renderer/components/overflowTip', () => ({
  OverflowTip: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

const column = (name: string, typeName = 'integer') => ({
  name,
  typeName,
  ordinalPosition: 1,
  primaryKeySequenceId: 0,
  columnDisplaySize: 0,
  scale: 0,
  precision: 0,
  columnProperties: [],
  autoincrement: false,
  primaryKey: false,
  nullable: true,
});

const tables: Table[] = [
  {
    name: 'orders',
    type: 'TABLE',
    schema: 'sales',
    columns: [column('id'), column('order', 'text')],
  },
  {
    name: 'orders_v',
    type: 'VIEW',
    schema: 'sales',
    columns: [column('id')],
  },
];

class FakeDataTransfer {
  data = new Map<string, string>();

  effectAllowed = 'uninitialized';

  get types() {
    return Array.from(this.data.keys());
  }

  setData(format: string, value: string) {
    this.data.set(format, value);
  }

  getData(format: string) {
    return this.data.get(format) ?? '';
  }
}

const renderTree = (
  props: Partial<React.ComponentProps<typeof SchemaTreeViewerWithSchema>> = {},
) =>
  render(
    <ThemeProvider theme={createTheme()}>
      <SchemaTreeViewerWithSchema
        databaseName="test_db"
        type="postgres"
        schema={tables}
        isLoading={false}
        {...props}
      />
    </ThemeProvider>,
  );

// Only the database node starts expanded; open the schema so table rows mount.
const expandSchema = () =>
  fireEvent.click(screen.getByTestId('schema-tree-schema'));

describe('SchemaTreeViewerWithSchema', () => {
  it('renders rows with data hooks and no drag wiring by default', () => {
    renderTree();
    expandSchema();

    const tableRow = screen.getByTestId('schema-tree-table');
    expect(tableRow).toHaveAttribute('data-schema', 'sales');
    expect(tableRow).toHaveAttribute('data-table', 'orders');
    expect(tableRow).not.toHaveAttribute('draggable');

    expect(screen.getByTestId('schema-tree-view')).toHaveAttribute(
      'data-table',
      'orders_v',
    );
    expect(screen.getByTestId('schema-tree-schema')).toHaveAttribute(
      'data-schema',
      'sales',
    );
    expect(screen.getByTestId('schema-tree-database')).toBeInTheDocument();
  });

  it('writes a drag payload when draggable', () => {
    renderTree({ draggable: true, connectionId: 'conn-1' });
    expandSchema();

    const tableRow = screen.getByTestId('schema-tree-table');
    expect(tableRow).toHaveAttribute('draggable', 'true');

    const dataTransfer = new FakeDataTransfer();
    fireEvent.dragStart(tableRow, { dataTransfer });

    expect(dataTransfer.getData('text/plain')).toBe('sales.orders');
    expect(JSON.parse(dataTransfer.getData(SCHEMA_OBJECT_MIME))).toEqual({
      version: 1,
      kind: 'table',
      connectionId: 'conn-1',
      connectionType: 'postgres',
      schema: 'sales',
      table: 'orders',
      columns: ['id', 'order'],
    });
    expect(dataTransfer.effectAllowed).toBe('copy');
  });

  it('does not make the database row draggable', () => {
    renderTree({ draggable: true });
    expect(screen.getByTestId('schema-tree-database')).not.toHaveAttribute(
      'draggable',
    );
    expect(screen.getByTestId('schema-tree-schema')).toHaveAttribute(
      'draggable',
      'true',
    );
  });

  it('writes column payloads once a table is expanded', () => {
    renderTree({ draggable: true, connectionId: 'conn-1' });
    expandSchema();

    // Expand the table so its column rows mount
    fireEvent.click(screen.getByTestId('schema-tree-table'));

    const columnRow = screen.getAllByTestId('schema-tree-column')[1];
    expect(columnRow).toHaveAttribute('data-column', 'order');

    const dataTransfer = new FakeDataTransfer();
    fireEvent.dragStart(columnRow, { dataTransfer });

    // Reserved word → quoted for Postgres
    expect(dataTransfer.getData('text/plain')).toBe('"order"');
    expect(JSON.parse(dataTransfer.getData(SCHEMA_OBJECT_MIME)).kind).toBe(
      'column',
    );
  });

  it('forwards right-clicks with the node reference', () => {
    const onContextMenu = jest.fn();
    renderTree({ onContextMenu });
    expandSchema();

    fireEvent.contextMenu(screen.getByTestId('schema-tree-view'));

    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0][1]).toEqual({
      kind: 'view',
      schema: 'sales',
      table: 'orders_v',
      tableType: 'VIEW',
      columns: ['id'],
    });
  });
});
