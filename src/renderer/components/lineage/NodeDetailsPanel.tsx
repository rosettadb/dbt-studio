import React from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
} from '@mui/material';
import type { LineageModelMetadata, LineageNode } from '../../../types/lineage';
import { OverflowTip } from '../overflowTip';

type LineageNodeDetails = LineageNode &
  Partial<Pick<LineageModelMetadata, 'dependsOn' | 'columns'>>;

type NodeDetailsPanelProps = {
  node?: LineageNodeDetails;
};

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({ node }) => {
  if (!node) {
    return (
      <Box
        sx={{
          px: 3,
          py: 4,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: (theme) => theme.palette.text.secondary,
        }}
      >
        Select a node to inspect metadata.
      </Box>
    );
  }

  const { label, resourceType, description, tags, columns, dependsOn } = node;

  return (
    <Stack spacing={2} sx={{ px: 3, py: 3, height: '100%', overflow: 'auto' }}>
      <Box>
        <Typography variant="subtitle1">{label}</Typography>
        <Typography variant="caption" color="text.secondary">
          {resourceType}
        </Typography>
      </Box>

      {description && (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ whiteSpace: 'pre-wrap' }}
        >
          {description}
        </Typography>
      )}

      {tags && tags.length > 0 && (
        <Stack direction="row" spacing={1} flexWrap="wrap">
          {tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" />
          ))}
        </Stack>
      )}

      {dependsOn?.nodes && dependsOn.nodes.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Depends On
          </Typography>
          <List dense disablePadding>
            {dependsOn.nodes.map((id) => (
              <ListItem key={id} disableGutters dense>
                <OverflowTip>{id}</OverflowTip>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {columns && Object.keys(columns).length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Columns
          </Typography>
          <Divider />
          <List dense disablePadding>
            {Object.values(columns).map((column) => (
              <ListItem key={column.name} alignItems="flex-start" dense>
                <ListItemText
                  primary={
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography variant="body2">{column.name}</Typography>
                      {column.meta?.data_type && (
                        <Chip
                          size="small"
                          label={column.meta.data_type}
                          variant="outlined"
                        />
                      )}
                    </Stack>
                  }
                  secondary={
                    column.description && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ whiteSpace: 'pre-wrap' }}
                      >
                        {column.description}
                      </Typography>
                    )
                  }
                />
              </ListItem>
            ))}
          </List>
        </Box>
      )}
    </Stack>
  );
};
