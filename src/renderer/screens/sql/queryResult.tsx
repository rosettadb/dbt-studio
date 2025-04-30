import React from 'react';
import { QueryResponseType } from '../../../types/backend';
import { CustomTable } from '../../components/customTable';
import { underscoreToTitleCase } from '../../helpers/utils';

type Props = {
  results: QueryResponseType;
};

export const QueryResult: React.FC<Props> = ({ results }) => {
  const columns = React.useMemo(() => {
    return results.fields?.map((field) => field.name) ?? [];
  }, [results]);

  const rows = React.useMemo(() => {
    return results.data ?? [];
  }, [results]);

  return (
    <CustomTable<Record<string, any>>
      id="query-result"
      name="Query Result"
      rows={rows as any}
      columns={columns.map((column) => ({
        id: column,
        label: underscoreToTitleCase(column),
        render: (value) => (
          <div
            style={{
              whiteSpace: 'nowrap',
              minHeight: '40px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {JSON.stringify(value[column]).replace(/"/g, '')}
          </div>
        ),
      }))}
    />
  );
};
