import React from 'react';
import { Box, Typography } from '@mui/material';
import { Modal } from '../modals/modal';
import { ErDiagramPanel } from './ErDiagramPanel';
import type { ErTableInput } from './buildErGraph';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Shown under the title, e.g. the connection or instance name. */
  sourceName?: string;
  tables: ErTableInput[];
  /** Every schema of the connection, also the ones without tables. */
  schemaNames?: string[];
  /** Schema shown first; defaults to the first schema by name. */
  initialSchema?: string;
  isLoading?: boolean;
  error?: string | null;
};

/**
 * Full-screen ER diagram. The dialog unmounts its content when closed, so
 * each opening starts on `initialSchema` and nothing is built while closed.
 */
export const ErDiagramModal: React.FC<Props> = ({
  isOpen,
  onClose,
  sourceName,
  tables,
  schemaNames,
  initialSchema,
  isLoading,
  error,
}) => (
  <Modal
    isOpen={isOpen}
    onClose={onClose}
    title="ER Diagram"
    hideHeader
    fullScreen
    maxWidth="xl"
  >
    <Box sx={{ height: '100%' }} data-testid="er-diagram-modal">
      <ErDiagramPanel
        tables={tables}
        schemaNames={schemaNames}
        initialSchema={initialSchema}
        isLoading={isLoading}
        error={error}
        // Room on the right for the dialog's close button.
        headerSx={{ px: 3, pt: 3, pb: 2, pr: 8 }}
        headerStart={
          <>
            <Typography variant="h6">ER Diagram</Typography>
            {sourceName && (
              <Typography variant="body2" color="text.secondary">
                {sourceName}
              </Typography>
            )}
          </>
        }
      />
    </Box>
  </Modal>
);
