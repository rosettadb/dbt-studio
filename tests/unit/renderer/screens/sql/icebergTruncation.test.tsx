import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryResult } from '../../../../../src/renderer/screens/sql/queryResult';

jest.mock('../../../../../src/renderer/components/customTable', () => ({
  CustomTable: () => <div data-testid="table" />,
}));
jest.mock(
  '../../../../../src/renderer/components/queryResult/queryVisualization/QueryResultVisualization',
  () => ({
    QueryResultVisualization: () => <div />,
  }),
);
jest.mock('../../../../../src/renderer/helpers/utils', () => ({
  underscoreToTitleCase: (value: string) => value,
}));
jest.mock('../../../../../src/renderer/services/duckLake.service', () => ({
  DuckLakeService: {},
}));

describe('SQL result truncation notice', () => {
  it('shows that displayed rows and exports are incomplete', () => {
    render(
      <QueryResult
        results={{
          success: true,
          data: [{ id: 1 }] as any,
          fields: [{ name: 'id', type: 0 }],
          truncated: true,
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Showing only the first 1 rows',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'exports are limited to these rows',
    );
  });
  it('does not change the display of complete results', () => {
    render(
      <QueryResult
        results={{
          success: true,
          data: [{ id: 1 }] as any,
          fields: [{ name: 'id', type: 0 }],
        }}
      />,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
