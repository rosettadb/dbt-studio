/**
 * Cell Insert Bar
 * Colab-style "+ Code" / "+ SQL" / "+ Text" affordance shown between cells.
 * A small "+" is always visible on the divider and expands into the buttons on
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
      height: persistent ? 36 : 30,
      my: persistent ? 1 : 0,
      position: 'relative',
      '& .cell-insert-options': { display: persistent ? 'flex' : 'none' },
      '&:hover .cell-insert-options': { display: 'flex' },
      '&:hover .cell-insert-plus': { display: 'none' },
      '& .MuiButton-root': persistent ? undefined : { borderRadius: 12 },
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
    {!persistent && (
      <Box
        className="cell-insert-plus"
        sx={{
          zIndex: 1,
          width: 22,
          height: 22,
          borderRadius: '50%',
          border: '1px solid',
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <AddIcon sx={{ fontSize: 16 }} />
      </Box>
    )}
    <Box className="cell-insert-options" sx={{ gap: 1 }}>
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
  </Box>
);

export default CellInsertBar;
