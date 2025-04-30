import React from 'react';
import {
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  Typography,
} from '@mui/material';
import { ColumnType, TableRowAction } from './types';

type Props<T> = {
  onRequestSort: (property: keyof T) => void;
  orderBy?: keyof T;
  order: 'asc' | 'desc';
  indexCell?: boolean;
  columns: Array<ColumnType<T>>;
  rowActions?: Array<TableRowAction<T>>;
};

const CustomTableHead = <T,>({
  onRequestSort,
  orderBy,
  order,
  indexCell,
  columns,
  rowActions,
}: Props<T>) => {
  return (
    <TableHead>
      <TableRow>
        {indexCell && (
          <TableCell padding="checkbox">
            <Typography variant="subtitle2" align="center">
              #
            </Typography>
          </TableCell>
        )}
        {columns.map((headCell, index) => (
          <TableCell
            key={index}
            align="left"
            sortDirection={orderBy === headCell.id ? order : false}
          >
            <TableSortLabel
              active={orderBy === headCell.id}
              direction={orderBy === headCell.id ? order : 'asc'}
              onClick={() => {
                onRequestSort(headCell.id);
              }}
              style={{ whiteSpace: 'nowrap' }}
            >
              {headCell.label}
            </TableSortLabel>
          </TableCell>
        ))}
        {rowActions && rowActions?.length > 0 && <TableCell>Actions</TableCell>}
      </TableRow>
    </TableHead>
  );
};

export { CustomTableHead };
