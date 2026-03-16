import React from 'react';
import { TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { ColumnType, TableRowAction } from './types';

/* eslint-disable react/no-unused-prop-types */
type Props<T> = {
  onRequestSort: (property: keyof T) => void;
  orderBy?: keyof T;
  order: 'asc' | 'desc';
  indexCell?: boolean;
  columns: Array<ColumnType<T>>;
  rowActions?: Array<TableRowAction<T>>;
};
/* eslint-enable react/no-unused-prop-types */

const CustomTableHead = <T,>(props: Props<T>) => {
  const { indexCell, columns, rowActions } = props;
  // Note: onRequestSort, orderBy, and order are intentionally not used
  // Sorting is disabled for notebooks but props kept for API compatibility
  return (
    <TableHead>
      <TableRow>
        {indexCell && (
          <TableCell
            padding="checkbox"
            sx={{
              py: 0.5,
              borderRight: '1px solid',
              borderColor: 'divider',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
            }}
          >
            <Typography
              variant="subtitle2"
              align="center"
              sx={{ fontSize: 12, fontWeight: 600 }}
            >
              #
            </Typography>
          </TableCell>
        )}
        {columns.map((headCell, index) => (
          <TableCell
            key={index}
            align="left"
            sx={{
              py: 0.5,
              borderRight: index < columns.length - 1 ? '1px solid' : undefined,
              borderColor: 'divider',
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
            }}
          >
            <Typography
              sx={{
                fontSize: '12px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
              }}
            >
              {headCell.label}
            </Typography>
          </TableCell>
        ))}
        {rowActions && rowActions?.length > 0 && (
          <TableCell
            sx={{
              py: 0.5,
              fontSize: 12,
              fontWeight: 600,
              bgcolor: (theme) =>
                theme.palette.mode === 'dark' ? 'grey.900' : 'grey.100',
            }}
          >
            Actions
          </TableCell>
        )}
      </TableRow>
    </TableHead>
  );
};

export { CustomTableHead };
