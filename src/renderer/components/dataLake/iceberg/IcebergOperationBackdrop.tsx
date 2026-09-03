import { Backdrop, CircularProgress, Typography } from '@mui/material';
import React from 'react';

export interface IcebergOperation {
  /** Whether this operation is currently in flight. */
  isLoading: boolean;
  /** Label shown on the backdrop while the operation runs. */
  label: string;
}

interface IcebergOperationBackdropProps {
  /** The operations that can block the UI; the first in-flight one wins. */
  operations: IcebergOperation[];
}

/**
 * Full-screen loading backdrop that locks the UI while an Iceberg operation
 * (import, rename, delete, namespace create/drop, connection test) is running.
 * Rendered above everything (drawer + 999) so the user cannot interact with
 * the app or navigate until the operation finishes and the UI is unlocked.
 */
export const IcebergOperationBackdrop: React.FC<
  IcebergOperationBackdropProps
> = ({ operations }) => {
  const active = operations.find((operation) => operation.isLoading);
  return (
    <Backdrop
      open={!!active}
      sx={{
        color: '#fff',
        zIndex: (theme) => theme.zIndex.drawer + 999, // above everything incl. sidebar + dialogs
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 2,
      }}
    >
      <CircularProgress color="inherit" />
      <Typography variant="h6" sx={{ textAlign: 'center' }}>
        {active?.label ?? 'Working…'}
      </Typography>
    </Backdrop>
  );
};
