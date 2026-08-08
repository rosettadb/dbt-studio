/**
 * IcebergInstanceListItem
 * Renders one Iceberg instance row in the DataLake screen instance list.
 * Pattern: matches DuckLake instance list item presentation.
 */

import React from 'react';
import {
  Box,
  Typography,
  Chip,
  IconButton,
  Tooltip,
  useTheme,
} from '@mui/material';
import {
  LocalFireDepartment,
  Edit,
  Delete,
  Cloud,
  Storage as StorageIcon,
} from '@mui/icons-material';
import type { IcebergInstanceListItem as IcebergInstance } from '../../../types/iceberg';

interface IcebergInstanceListItemProps {
  instance: IcebergInstance;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

const catalogTypeLabel: Record<string, string> = {
  sqlite: 'SQLite',
  rest: 'REST',
  polaris: 'Polaris',
  glue: 'Glue',
  hive: 'Hive',
  hadoop: 'Hadoop',
  sql: 'SQL',
  nessie: 'Nessie',
};

export const IcebergInstanceListItem: React.FC<
  IcebergInstanceListItemProps
> = ({ instance, isSelected, onSelect, onEdit, onDelete }) => {
  const theme = useTheme();

  return (
    <Box
      onClick={() => onSelect(instance.id)}
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        px: 1.5,
        py: 1,
        borderRadius: 1,
        cursor: 'pointer',
        borderLeft: isSelected
          ? `3px solid ${theme.palette.primary.main}`
          : '3px solid transparent',
        backgroundColor: isSelected
          ? theme.palette.action.selected
          : 'transparent',
        '&:hover': {
          backgroundColor: theme.palette.action.hover,
        },
        transition: 'background-color 0.15s ease, border-left-color 0.15s ease',
      }}
    >
      {/* Icon */}
      <LocalFireDepartment
        fontSize="small"
        sx={{
          color: isSelected
            ? theme.palette.primary.main
            : theme.palette.text.secondary,
          flexShrink: 0,
        }}
      />

      {/* Name + chips */}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="body2"
          fontWeight={isSelected ? 700 : 500}
          noWrap
          sx={{ lineHeight: 1.3 }}
        >
          {instance.name}
        </Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
          <Chip
            label={
              catalogTypeLabel[instance.catalogType] ?? instance.catalogType
            }
            size="small"
            color={isSelected ? 'primary' : 'default'}
            variant="outlined"
            sx={{ height: 16, fontSize: '0.65rem' }}
          />
          <Chip
            icon={
              instance.storageType === 'cloud' ? (
                <Cloud sx={{ fontSize: '0.75rem !important' }} />
              ) : (
                <StorageIcon sx={{ fontSize: '0.75rem !important' }} />
              )
            }
            label={instance.storageType}
            size="small"
            variant="outlined"
            sx={{ height: 16, fontSize: '0.65rem' }}
          />
        </Box>
      </Box>

      {/* Actions */}
      <Box
        sx={{ display: 'flex', gap: 0.25, flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        <Tooltip title="Edit">
          <IconButton
            size="small"
            onClick={() => onEdit(instance.id)}
            sx={{ p: 0.5 }}
          >
            <Edit fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={() => onDelete(instance.id)}
            sx={{ p: 0.5, color: theme.palette.error.main }}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );
};
