import React from 'react';
import { TableCell, TableRow } from '@mui/material';
import { CustomTableColumn } from './CustomTableColumn';
import { ColumnType, TableRowAction } from './types';

const CustomTableRow = <T,>({
  row,
  columns,
  index,
  indexCell,
  rowActions,
}: {
  row: T;
  columns: Array<ColumnType<T>>;
  index: number;
  indexCell?: boolean;
  rowActions?: Array<TableRowAction<T>>;
}) => {
  return (
    <TableRow>
      {indexCell && <TableCell>{index}</TableCell>}
      {columns.map((column) => (
        <CustomTableColumn
          key={column.id as string}
          value={column.render ? column.render(row) : row[column.id]}
        />
      ))}

      {rowActions && rowActions?.length > 0 && (
        <TableCell
          style={{
            paddingTop: 0,
            paddingBottom: 0,
          }}
        >
          <div style={{ display: 'flex' }}>
            {rowActions?.map((rowAction, innerIndex) => (
              <div key={innerIndex}>{rowAction.Component(row)}</div>
            ))}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
};

export { CustomTableRow };
