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
      rowsPerPageOptions={[5, 10, 25, 100]}
      component="div"
      count={total}
      rowsPerPage={perPage}
      page={page}
      onPageChange={(_ignore, value) => setPage(value)}
      onRowsPerPageChange={(event) =>
        setPerPage(parseInt(event.target.value, 10))
      }
    />
  );
};

export { CustomTablePagination };
