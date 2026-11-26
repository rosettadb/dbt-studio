import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { ErDiagramModal } from '../../../../../src/renderer/components/erDiagram/ErDiagramModal';
import type { ErGraph } from '../../../../../src/renderer/components/erDiagram/buildErGraph';

// React Flow can't lay out in jsdom; the stub shows what it was given.
jest.mock('../../../../../src/renderer/components/erDiagram/ErDiagram', () => ({
  ErDiagram: ({ graph }: { graph: ErGraph }) => (
    <div data-testid="diagram">{graph.tables.map((t) => t.name).join(',')}</div>
  ),
}));

const theme = createTheme();
const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

const tables = [
  {
    name: 'customers',
    schema: 'sales',
    columns: [{ name: 'id', typeName: 'INT' }],
  },
  {
    name: 'orders',
    schema: 'sales',
    columns: [
      { name: 'id', typeName: 'INT' },
      { name: 'customer_id', typeName: 'INT' },
    ],
  },
  {
    name: 'events',
    schema: 'audit',
    columns: [{ name: 'at', typeName: 'TS' }],
  },
];

describe('ErDiagramModal', () => {
  it('opens on the schema it was opened for, with counts', () => {
    wrap(
      <ErDiagramModal
        isOpen
        onClose={() => {}}
        sourceName="Warehouse"
        tables={tables}
        initialSchema="sales"
      />,
    );

    expect(screen.getByText('Warehouse')).toBeInTheDocument();
    expect(screen.getByTestId('diagram')).toHaveTextContent('customers,orders');
    expect(
      screen.getByText(/2 tables · 1 relationships \(1 matched by name\)/),
    ).toBeInTheDocument();
  });

  it('switches schema from the dropdown', () => {
    wrap(
      <ErDiagramModal
        isOpen
        onClose={() => {}}
        tables={tables}
        initialSchema="sales"
      />,
    );

    fireEvent.mouseDown(
      within(screen.getByTestId('er-diagram-schema-select')).getByRole(
        'combobox',
      ),
    );
    fireEvent.click(screen.getByRole('option', { name: 'audit' }));

    expect(screen.getByTestId('diagram')).toHaveTextContent('events');
  });

  it('starts on the first schema when none is given', () => {
    wrap(<ErDiagramModal isOpen onClose={() => {}} tables={tables} />);

    expect(screen.getByTestId('diagram')).toHaveTextContent('events');
  });

  it('says a schema without tables is empty instead of showing another one', () => {
    wrap(
      <ErDiagramModal
        isOpen
        onClose={() => {}}
        tables={tables}
        initialSchema="staging"
      />,
    );

    expect(screen.getByText('No tables in this schema.')).toBeInTheDocument();
    expect(screen.queryByTestId('diagram')).not.toBeInTheDocument();
  });

  it('shows loading and errors instead of the diagram', () => {
    const { rerender } = wrap(
      <ErDiagramModal isOpen onClose={() => {}} tables={[]} isLoading />,
    );
    expect(screen.getByRole('progressbar')).toBeInTheDocument();

    rerender(
      <ThemeProvider theme={theme}>
        <ErDiagramModal
          isOpen
          onClose={() => {}}
          tables={[]}
          error="Catalog unreachable"
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Catalog unreachable')).toBeInTheDocument();
    expect(screen.queryByTestId('diagram')).not.toBeInTheDocument();
  });

  it('renders nothing while closed', () => {
    wrap(<ErDiagramModal isOpen={false} onClose={() => {}} tables={tables} />);

    expect(screen.queryByTestId('er-diagram-modal')).not.toBeInTheDocument();
  });
});
