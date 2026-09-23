/**
 * Cell Insert Bar
 * Colab-style "+ Code" / "+ SQL" / "+ Text" affordance shown between cells on
 * hover.
 */

import React from 'react';
import { Box, Button } from '@mui/material';
import { Add as AddIcon } from '@mui/icons-material';

interface CellInsertBarProps {
  onAddCode: () => void;
  onAddSql: () => void;
  onAddText: () => void;
  /** Always visible (used for the empty-notebook state and the trailing bar) */
  persistent?: boolean;
}

export const CellInsertBar: React.FC<CellInsertBarProps> = ({
  onAddCode,
  onAddSql,
  onAddText,
  persistent,
}) => (
  <Box
    className="cell-insert-bar"
    sx={{
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 1,
      height: persistent ? 36 : 18,
      my: persistent ? 1 : 0,
      opacity: persistent ? 1 : 0,
      transition: 'opacity 120ms ease',
      '&:hover': { opacity: 1 },
      position: 'relative',
      '&::before': persistent
        ? undefined
        : {
            content: '""',
            position: 'absolute',
            left: 0,
            right: 0,
            top: '50%',
            borderTop: '1px solid',
            borderColor: 'divider',
            zIndex: 0,
          },
    }}
  >
    <Button
      size="small"
      variant="outlined"
      startIcon={<AddIcon sx={{ fontSize: 14 }} />}
      onClick={onAddCode}
      sx={{
        zIndex: 1,
        bgcolor: 'background.paper',
        height: 24,
        fontSize: 11,
        textTransform: 'none',
        py: 0,
      }}
    >
      Code
    </Button>
    <Button
      size="small"
      variant="outlined"
      startIcon={<AddIcon sx={{ fontSize: 14 }} />}
      onClick={onAddSql}
      sx={{
        zIndex: 1,
        bgcolor: 'background.paper',
        height: 24,
        fontSize: 11,
        textTransform: 'none',
        py: 0,
      }}
    >
      SQL
    </Button>
    <Button
      size="small"
      variant="outlined"
      startIcon={<AddIcon sx={{ fontSize: 14 }} />}
      onClick={onAddText}
      sx={{
        zIndex: 1,
        bgcolor: 'background.paper',
        height: 24,
        fontSize: 11,
        textTransform: 'none',
        py: 0,
      }}
    >
      Text
    </Button>
  </Box>
);

export default CellInsertBar;
