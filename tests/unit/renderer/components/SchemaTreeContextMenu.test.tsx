import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { toast } from 'react-toastify';

import { SchemaTreeContextMenu } from '../../../../src/renderer/components/schemaTreeViewer/SchemaTreeContextMenu';
import {
  buildActionText,
  useSchemaTreeContextMenu,
} from '../../../../src/renderer/components/schemaTreeViewer/useSchemaTreeContextMenu';
import type { SchemaTreeNodeRef } from '../../../../src/renderer/components/schemaTreeViewer/types';

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const tableNode: SchemaTreeNodeRef = {
  kind: 'table',
  schema: 'sales',
  table: 'orders',
  tableType: 'TABLE',
  columns: ['id', 'order'],
};

const columnNode: SchemaTreeNodeRef = {
  ...tableNode,
  kind: 'column',
  column: 'order',
  columnType: 'text',
};

const menuItems = () =>
  screen
    .getAllByRole('menuitem')
    .map((el) =>
      el.getAttribute('data-testid')?.replace('schema-tree-menu-', ''),
    );

describe('SchemaTreeContextMenu', () => {
  it('shows table entries according to capabilities', () => {
    wrap(
      <SchemaTreeContextMenu
        state={{ mouseX: 10, mouseY: 10, node: tableNode }}
        onClose={() => {}}
        onAction={() => {}}
        capabilities={{
          insert: true,
          preview: true,
          rename: true,
          refresh: true,
        }}
      />,
    );

    expect(menuItems()).toEqual([
      'insert-name',
      'copy-name',
      'copy-qualified-name',
      'copy-columns',
      'generate-select',
      'generate-select-columns',
      'generate-count',
      'generate-insert',
      'preview',
      'rename',
      'refresh',
    ]);
    expect(screen.getByText('Rename table')).toBeInTheDocument();
  });

  it('hides insert/generate/preview/rename without capabilities', () => {
    wrap(
      <SchemaTreeContextMenu
        state={{ mouseX: 10, mouseY: 10, node: { ...tableNode, kind: 'view' } }}
        onClose={() => {}}
        onAction={() => {}}
      />,
    );

    expect(menuItems()).toEqual([
      'copy-name',
      'copy-qualified-name',
      'copy-columns',
    ]);
  });

  it('omits the INSERT template for views', () => {
    wrap(
      <SchemaTreeContextMenu
        state={{ mouseX: 10, mouseY: 10, node: { ...tableNode, kind: 'view' } }}
        onClose={() => {}}
        onAction={() => {}}
        capabilities={{ insert: true }}
      />,
    );
    expect(menuItems()).not.toContain('generate-insert');
  });

  it('shows column entries', () => {
    wrap(
      <SchemaTreeContextMenu
        state={{ mouseX: 10, mouseY: 10, node: columnNode }}
        onClose={() => {}}
        onAction={() => {}}
        capabilities={{ insert: true, rename: true }}
      />,
    );

    expect(menuItems()).toEqual([
      'insert-name',
      'copy-name',
      'copy-qualified-name',
      'generate-select-column',
      'generate-select-distinct',
      'generate-count-by',
      'rename',
    ]);
    expect(screen.getByText('Rename column')).toBeInTheDocument();
  });

  it('reports the chosen action and closes', () => {
    const onAction = jest.fn();
    const onClose = jest.fn();
    wrap(
      <SchemaTreeContextMenu
        state={{ mouseX: 10, mouseY: 10, node: tableNode }}
        onClose={onClose}
        onAction={onAction}
        capabilities={{ insert: true }}
      />,
    );

    fireEvent.click(screen.getByTestId('schema-tree-menu-generate-select'));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledWith('generate-select', tableNode);
  });

  it('renders nothing when closed', () => {
    wrap(
      <SchemaTreeContextMenu
        state={null}
        onClose={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.queryByRole('menuitem')).toBeNull();
  });
});

describe('buildActionText', () => {
  it('produces identifiers and SQL for table nodes', () => {
    expect(buildActionText('insert-name', tableNode, 'postgres')).toBe(
      'sales.orders',
    );
    expect(buildActionText('copy-name', tableNode, 'postgres')).toBe('orders');
    expect(buildActionText('copy-qualified-name', tableNode, 'mssql')).toBe(
      'sales.orders',
    );
    expect(buildActionText('copy-columns', tableNode, 'postgres')).toBe(
      'id, "order"',
    );
    expect(buildActionText('generate-select', tableNode, 'postgres', 10)).toBe(
      'SELECT *\nFROM sales.orders\nLIMIT 10;',
    );
    expect(
      buildActionText('generate-select-columns', tableNode, 'postgres'),
    ).toBe('SELECT\n  id,\n  "order"\nFROM sales.orders\nLIMIT 100;');
    expect(buildActionText('generate-count', tableNode, 'postgres')).toBe(
      'SELECT COUNT(*) AS total_rows\nFROM sales.orders;',
    );
    expect(buildActionText('generate-insert', tableNode, 'postgres')).toContain(
      'INSERT INTO sales.orders (id, "order")',
    );
    expect(buildActionText('preview', tableNode, 'postgres', 5)).toBe(
      'SELECT *\nFROM sales.orders\nLIMIT 5;',
    );
  });

  it('produces identifiers and SQL for column nodes', () => {
    expect(buildActionText('insert-name', columnNode, 'postgres')).toBe(
      '"order"',
    );
    expect(buildActionText('copy-name', columnNode, 'postgres')).toBe('order');
    expect(buildActionText('copy-qualified-name', columnNode, 'postgres')).toBe(
      'sales.orders."order"',
    );
    expect(
      buildActionText('generate-select-column', columnNode, 'postgres'),
    ).toBe('SELECT\n  "order"\nFROM sales.orders\nLIMIT 100;');
    expect(
      buildActionText('generate-select-distinct', columnNode, 'postgres'),
    ).toBe('SELECT DISTINCT "order"\nFROM sales.orders\nLIMIT 100;');
    expect(
      buildActionText('generate-count-by', columnNode, 'postgres'),
    ).toContain('GROUP BY "order"');
  });

  it('handles schema and database nodes', () => {
    const schemaNode: SchemaTreeNodeRef = {
      kind: 'schema',
      schema: 'my schema',
    };
    expect(buildActionText('insert-name', schemaNode, 'postgres')).toBe(
      '"my schema"',
    );
    expect(buildActionText('copy-name', schemaNode, 'postgres')).toBe(
      'my schema',
    );
    expect(
      buildActionText(
        'copy-name',
        { kind: 'database', databaseName: 'db' },
        'postgres',
      ),
    ).toBe('db');
    expect(
      buildActionText('generate-select', schemaNode, 'postgres'),
    ).toBeNull();
  });

  it('returns null for non-text actions', () => {
    expect(buildActionText('rename', tableNode, 'postgres')).toBeNull();
    expect(buildActionText('refresh', tableNode, 'postgres')).toBeNull();
  });
});

describe('useSchemaTreeContextMenu', () => {
  const Host: React.FC<{
    onInsertText?: (t: string) => void;
    onPreviewSql?: (t: string) => void;
    onRename?: (n: SchemaTreeNodeRef, name: string) => void;
    onRefresh?: () => void;
    node?: SchemaTreeNodeRef;
  }> = ({ node = tableNode, ...handlers }) => {
    const { onContextMenu, menu } = useSchemaTreeContextMenu({
      connectionType: 'postgres',
      ...handlers,
    });
    return (
      <>
        <div data-testid="row" onContextMenu={(e) => onContextMenu(e, node)}>
          row
        </div>
        {menu}
      </>
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
    });
  });

  it('opens on right-click and inserts generated SQL', () => {
    const onInsertText = jest.fn();
    wrap(<Host onInsertText={onInsertText} />);

    fireEvent.contextMenu(screen.getByTestId('row'), {
      clientX: 5,
      clientY: 6,
    });
    fireEvent.click(screen.getByTestId('schema-tree-menu-generate-count'));

    expect(onInsertText).toHaveBeenCalledWith(
      'SELECT COUNT(*) AS total_rows\nFROM sales.orders;',
    );
  });

  it('copies names to the clipboard', async () => {
    wrap(<Host />);

    fireEvent.contextMenu(screen.getByTestId('row'));
    fireEvent.click(screen.getByTestId('schema-tree-menu-copy-qualified-name'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('sales.orders');
    await screen.findByTestId('row'); // let the promise settle
    expect(toast.success).toHaveBeenCalled();
  });

  it('runs previews and refreshes', () => {
    const onPreviewSql = jest.fn();
    const onRefresh = jest.fn();
    wrap(<Host onPreviewSql={onPreviewSql} onRefresh={onRefresh} />);

    fireEvent.contextMenu(screen.getByTestId('row'));
    fireEvent.click(screen.getByTestId('schema-tree-menu-preview'));
    expect(onPreviewSql).toHaveBeenCalledWith(
      'SELECT *\nFROM sales.orders\nLIMIT 100;',
    );

    fireEvent.contextMenu(screen.getByTestId('row'));
    fireEvent.click(screen.getByTestId('schema-tree-menu-refresh'));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('asks for a new name before renaming', () => {
    const onRename = jest.fn();
    wrap(<Host onRename={onRename} node={columnNode} />);

    fireEvent.contextMenu(screen.getByTestId('row'));
    fireEvent.click(screen.getByTestId('schema-tree-menu-rename'));

    const input = screen.getByTestId('schema-tree-rename-input');
    expect(input).toHaveValue('order');
    // Same name → cannot confirm
    expect(screen.getByTestId('schema-tree-rename-confirm')).toBeDisabled();

    fireEvent.change(input, { target: { value: 'order_number' } });
    fireEvent.click(screen.getByTestId('schema-tree-rename-confirm'));

    expect(onRename).toHaveBeenCalledWith(columnNode, 'order_number');
  });
});
