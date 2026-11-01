import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryResult } from '../../../../src/renderer/screens/sql/queryResult';
import type { QueryResponseType } from '../../../../src/types/backend';

jest.mock('react-toastify', () => ({
  toast: { error: jest.fn(), info: jest.fn() },
}));
jest.mock('../../../../src/renderer/services/duckLake.service', () => ({
  DuckLakeService: {},
}));
jest.mock('../../../../src/renderer/components/customTable', () => ({
  CustomTable: () => null,
}));
jest.mock('../../../../src/renderer/helpers/utils', () => ({
  underscoreToTitleCase: (value: string) => value,
}));
jest.mock(
  '../../../../src/renderer/components/queryResult/queryVisualization/QueryResultVisualization',
  () => ({ QueryResultVisualization: () => null }),
);

const results = (patch: Partial<QueryResponseType> = {}): QueryResponseType =>
  ({
    success: true,
    data: [{ id: '1' }, { id: '2' }],
    fields: [{ name: 'id', type: 0 }],
    rowCount: 2,
    ...patch,
  }) as QueryResponseType;

describe('QueryResult truncation notice', () => {
  it('tells the user when a connector stopped at its row cap', () => {
    render(<QueryResult results={results({ truncated: true })} />);
    const notice = screen.getByTestId('sql-results-truncated');
    expect(notice.textContent).toContain('Showing the first 2 rows');
    expect(notice.textContent).toContain('aggregate in SQL');
  });

  it('shows nothing for a complete result', () => {
    render(<QueryResult results={results()} />);
    expect(screen.queryByTestId('sql-results-truncated')).toBeNull();
  });
});
