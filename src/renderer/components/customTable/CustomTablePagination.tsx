import React from 'react';
import { TablePagination } from '@mui/material';

type PaginationType = {
  page: number;
  setPage: (page: number) => void;
  perPage: number;
  setPerPage: (perPage: number) => void;
  total: number;
};

const CustomTablePagination = ({
  page,
  setPage,
  perPage,
  setPerPage,
  total,
}: PaginationType) => {
  return (
    <TablePagination
      rowsPerPageOptions={[10, 25, 100, 500, 1000]}
      component="div"
      count={total}
      rowsPerPage={perPage}
      page={page}
      onPageChange={(_ignore, value) => setPage(value)}
      onRowsPerPageChange={(event) =>
        setPerPage(parseInt(event.target.value, 10))
      }
      labelDisplayedRows={({ from, to, count }) => {
        const fmt = (n: number) => {
          try {
            return new Intl.NumberFormat('de-DE').format(n);
          } catch {
            return String(n);
          }
        };
        return `${fmt(from)}–${fmt(to)} of ${fmt(count === -1 ? to : count)}`;
      }}
    />
  );
};

export { CustomTablePagination };
