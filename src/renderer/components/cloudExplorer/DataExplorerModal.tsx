import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Select,
  MenuItem,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Divider,
} from '@mui/material';
import { Add, Close, Delete } from '@mui/icons-material';
import type { FilterCondition } from '../../../types/frontend';

const OPERATORS: FilterCondition['operator'][] = [
  '=',
  '!=',
  '>',
  '>=',
  '<',
  '<=',
  'LIKE',
];

interface DataExplorerModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (conditions: FilterCondition[]) => void;
  onClear: () => void;
  columns: Array<{ name: string; type: string }>;
  initialConditions?: FilterCondition[];
}

function generateId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function buildWhereClause(conditions: FilterCondition[]): string {
  const valid = conditions.filter((c) => c.column && c.value !== '');
  if (valid.length === 0) return '';
  return valid
    .map((c) => {
      const escapedValue = c.value.replace(/'/g, "''");
      const escapedCol = `"${c.column.replace(/"/g, '""')}"`;
      if (c.operator === 'LIKE') {
        return `${escapedCol} LIKE '${escapedValue}'`;
      }
      return `${escapedCol} ${c.operator} '${escapedValue}'`;
    })
    .join(' AND ');
}

export const DataExplorerModal: React.FC<DataExplorerModalProps> = ({
  open,
  onClose,
  onApply,
  onClear,
  columns,
  initialConditions,
}) => {
  const [conditions, setConditions] = useState<FilterCondition[]>(
    initialConditions && initialConditions.length > 0
      ? initialConditions
      : [{ id: generateId(), column: '', operator: '=', value: '' }],
  );

  // Synchronize state when initialConditions changes (e.g., cleared externally)
  React.useEffect(() => {
    if (open) {
      setConditions(
        initialConditions && initialConditions.length > 0
          ? initialConditions
          : [{ id: generateId(), column: '', operator: '=', value: '' }],
      );
    }
  }, [initialConditions, open]);

  const whereClause = useMemo(() => buildWhereClause(conditions), [conditions]);

  const handleAddCondition = () => {
    setConditions((prev) => [
      ...prev,
      { id: generateId(), column: '', operator: '=', value: '' },
    ]);
  };

  const handleRemoveCondition = (id: string) => {
    setConditions((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((c) => c.id !== id);
    });
  };

  const handleChange = (
    id: string,
    field: keyof Omit<FilterCondition, 'id'>,
    value: string,
  ) => {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)),
    );
  };

  const handleApply = () => {
    const valid = conditions.filter((c) => c.column && c.value !== '');
    onApply(valid);
  };

  const handleClear = () => {
    setConditions([{ id: generateId(), column: '', operator: '=', value: '' }]);
    onClear();
  };

  const canApply = conditions.some((c) => c.column && c.value !== '');

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Typography variant="h6">Filter Data</Typography>
          <IconButton onClick={onClose} size="small">
            <Close />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {conditions.map((condition, index) => (
            <Box
              key={condition.id}
              sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
            >
              {index > 0 && (
                <Typography
                  variant="caption"
                  sx={{ minWidth: 32, color: 'text.secondary' }}
                >
                  AND
                </Typography>
              )}
              {index === 0 && <Box sx={{ minWidth: 32 }} />}

              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Column</InputLabel>
                <Select
                  value={condition.column}
                  label="Column"
                  onChange={(e) =>
                    handleChange(condition.id, 'column', e.target.value)
                  }
                >
                  {columns.map((col) => (
                    <MenuItem key={col.name} value={col.name}>
                      <Box>
                        <Typography variant="body2">{col.name}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {col.type}
                        </Typography>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel>Operator</InputLabel>
                <Select
                  value={condition.operator}
                  label="Operator"
                  onChange={(e) =>
                    handleChange(
                      condition.id,
                      'operator',
                      e.target.value as FilterCondition['operator'],
                    )
                  }
                >
                  {OPERATORS.map((op) => (
                    <MenuItem key={op} value={op}>
                      {op}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <TextField
                size="small"
                label="Value"
                value={condition.value}
                onChange={(e) =>
                  handleChange(condition.id, 'value', e.target.value)
                }
                sx={{ flex: 1 }}
              />

              <IconButton
                size="small"
                onClick={() => handleRemoveCondition(condition.id)}
                disabled={conditions.length <= 1}
                aria-label="Remove condition"
              >
                <Delete fontSize="small" />
              </IconButton>
            </Box>
          ))}

          <Button
            startIcon={<Add />}
            onClick={handleAddCondition}
            size="small"
            sx={{ alignSelf: 'flex-start' }}
          >
            Add Condition
          </Button>

          {whereClause && (
            <>
              <Divider />
              <Box>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  gutterBottom
                  display="block"
                >
                  Generated Query Preview
                </Typography>
                <Box
                  component="pre"
                  sx={{
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    backgroundColor: 'action.hover',
                    p: 1.5,
                    borderRadius: 1,
                    overflowX: 'auto',
                    m: 0,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                  }}
                >
                  WHERE {whereClause}
                </Box>
              </Box>
            </>
          )}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} variant="text">
          Cancel
        </Button>
        <Button onClick={handleClear} variant="outlined" color="warning">
          Clear Filter
        </Button>
        <Button onClick={handleApply} variant="contained" disabled={!canApply}>
          Apply Filter
        </Button>
      </DialogActions>
    </Dialog>
  );
};
