import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AddConnection from '../../../../src/renderer/screens/addConnection';
import EditConnection from '../../../../src/renderer/screens/editConnection';
import { useGetConnectionById } from '../../../../src/renderer/controllers';

const mockPostgresRender = jest.fn();

jest.mock('../../../../src/renderer/components', () => {
  const MockForm = () => <div>connection form</div>;
  const Postgres = () => {
    mockPostgresRender();
    return <div>postgres form</div>;
  };

  return {
    Connections: {
      Postgres,
      Snowflake: MockForm,
      BigQuery: MockForm,
      Redshift: MockForm,
      Databricks: MockForm,
      DuckDB: MockForm,
      Kinetica: MockForm,
      FabricSpark: () => <div>Microsoft Fabric connection form</div>,
    },
  };
});

jest.mock('../../../../src/renderer/controllers', () => ({
  useGetConnectionById: jest.fn(),
}));

jest.mock('../../../../src/renderer/layouts', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

jest.mock('../../../../src/renderer/components/sidebarConnections', () => ({
  ConnectionsSidebar: () => null,
}));

describe('connection form routing', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('does not render PostgreSQL when a Fabric duplicate is opened', async () => {
    render(
      <MemoryRouter
        initialEntries={[
          {
            pathname: '/app/add-connection',
            state: {
              duplicateFrom: {
                id: 'fabric-1',
                connection: { type: 'fabricspark', name: 'Fabric' },
              },
            },
          },
        ]}
      >
        <Routes>
          <Route path="/app/add-connection" element={<AddConnection />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/Microsoft Fabric connection form/i),
    ).toBeTruthy();
    expect(mockPostgresRender).not.toHaveBeenCalled();
  });

  it('does not render PostgreSQL for an unknown persisted edit type', async () => {
    (useGetConnectionById as jest.Mock).mockReturnValue({
      data: {
        id: 'unknown-1',
        connection: { type: 'future-adapter', name: 'Unknown' },
      },
      isLoading: false,
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/app/connections/unknown-1/edit']}>
        <Routes>
          <Route
            path="/app/connections/:id/edit"
            element={<EditConnection />}
          />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText(/Unsupported connection type/i)).toBeTruthy();
    });
    expect(mockPostgresRender).not.toHaveBeenCalled();
  });
});
