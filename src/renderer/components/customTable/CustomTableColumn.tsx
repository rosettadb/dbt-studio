import React from 'react';
import { TableCell } from '@mui/material';

const CustomTableColumn = ({ value }: { value: any }) => {
  return (
    <TableCell
      style={{
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >
      {value}
    </TableCell>
  );
};
export { CustomTableColumn };
