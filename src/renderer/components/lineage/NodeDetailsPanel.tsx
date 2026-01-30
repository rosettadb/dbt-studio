import React, { useState, useMemo } from 'react';
import {
  Box,
  Typography,
  Chip,
  Stack,
  Divider,
  List,
  ListItem,
  ListItemText,
  Button,
  CircularProgress,
  IconButton,
  Collapse,
  Alert,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import RefreshIcon from '@mui/icons-material/Refresh';
import type { LineageModelMetadata, LineageNode } from '../../../types/lineage';
import { useColumnLineage } from '../../controllers/lineage.controller';
import { settingsServices } from '../../services';
import { OverflowTip } from '../overflowTip';

type LineageNodeDetails = LineageNode &
  Partial<Pick<LineageModelMetadata, 'dependsOn' | 'columns'>>;

type NodeDetailsPanelProps = {
  node?: LineageNodeDetails;
  projectId?: string; // Need projectId to make requests
  onColumnHover?: (upstreamNodeIds: string[]) => void;
  compact?: boolean;
};

export const NodeDetailsPanel: React.FC<NodeDetailsPanelProps> = ({
  node,
  projectId,
  onColumnHover,
  compact = false,
}) => {
  const [expandedColumns, setExpandedColumns] = useState<Set<string>>(
    new Set(),
  );
  const [isInstallingSqlglot, setIsInstallingSqlglot] = useState(false);

  const {
    mutate: fetchColumnLineage,
    data: columnLineageData,
    isLoading: isColumnLineageLoading,
    error: lineageError,
    isError: isLineageError,
  } = useColumnLineage();

  React.useEffect(() => {
    if (isLineageError && lineageError) {
      // eslint-disable-next-line no-console
      console.error('[NodeDetailsPanel] Column Lineage Error:', lineageError);
    }
  }, [isLineageError, lineageError]);

  const handleToggleColumn = (colName: string) => {
    setExpandedColumns((prev) => {
      const next = new Set(prev);
      if (next.has(colName)) {
        next.delete(colName);
      } else {
        next.add(colName);
      }
      return next;
    });
  };

  const handleInstallSqlglot = async () => {
    setIsInstallingSqlglot(true);
    try {
      await settingsServices.installSqlGlot();
      if (projectId && node && node.uniqueId) {
        fetchColumnLineage({
          projectId,
          modelId: node.uniqueId,
          targets: [],
          selectedColumn: { table: node.name, name: '' },
        });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
    } finally {
      setIsInstallingSqlglot(false);
    }
  };
  const [hasFetchedLineage, setHasFetchedLineage] = useState(false);

  const displayColumns = useMemo(() => {
    if (!node) return {};
    const { columns, uniqueId } = node;
    const derived: Record<string, { name: string; description?: string }> = {};
    if (columnLineageData?.columnLineage) {
      columnLineageData.columnLineage.forEach((edge) => {
        if (edge.target[0] === uniqueId) {
          const colName = edge.target[1];
          if (!derived[colName]) {
            derived[colName] = { name: colName };
          }
        }
      });
    }
    return { ...derived, ...(columns || {}) };
  }, [columnLineageData, node]);

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

  const { label, resourceType, description, tags, dependsOn, uniqueId } = node;

  const handleLoadColumnLineage = () => {
    fetchColumnLineage(
      {
        projectId,
        modelId: uniqueId,
        targets: [],
        selectedColumn: { table: node.name, name: '' },
      },
      {
        onSuccess: () => {
          setHasFetchedLineage(true);
        },
      },
    );
  };

  let startIcon = null;
  if (isColumnLineageLoading) {
    startIcon = <CircularProgress size={12} />;
  } else if (hasFetchedLineage) {
    startIcon = <RefreshIcon />;
  }

  const getUpstreamCols = (colName: string) => {
    if (!columnLineageData?.columnLineage) return [];
    // Edge target is [modelId, colName]
    // We want source [upstreamTable, upstreamCol]
    return columnLineageData.columnLineage
      .filter(
        (edge) =>
          edge.target[0] === uniqueId &&
          edge.target[1].toLowerCase() === colName.toLowerCase(),
      )
      .map((edge) => edge.source);
  };

  return (
    <Stack
      spacing={compact ? 1 : 2}
      sx={{
        px: compact ? 1.5 : 3,
        py: compact ? 1 : 3,
        height: '100%',
        overflow: 'auto',
        fontSize: 12,
        '& .MuiTypography-root': { fontSize: 12 },
      }}
    >
      <Box>
        <Typography variant="subtitle1" sx={{ fontSize: 12, fontWeight: 600 }}>
          {label}
        </Typography>
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
        <Stack direction="row" spacing={compact ? 0.5 : 1} flexWrap="wrap">
          {tags.map((tag) => (
            <Chip key={tag} label={tag} size="small" sx={{ fontSize: 12 }} />
          ))}
        </Stack>
      )}

      {dependsOn?.nodes && dependsOn.nodes.length > 0 && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            gutterBottom
          >
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

      {(Object.keys(displayColumns).length > 0 || resourceType === 'model') && (
        <Box>
          <Stack
            direction="row"
            alignItems="center"
            justifyContent="space-between"
          >
            <Typography variant="subtitle2">
              Columns{' '}
              {Object.keys(displayColumns).length > 0 &&
                `(${Object.keys(displayColumns).length})`}
            </Typography>
            {resourceType === 'model' && (
              <Button
                size="small"
                onClick={handleLoadColumnLineage}
                disabled={isColumnLineageLoading}
                startIcon={startIcon}
              >
                Load Lineage
              </Button>
            )}
          </Stack>
          <Divider sx={{ my: compact ? 0.5 : 1 }} />
          {isLineageError && (
            <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem' }}>
              {(lineageError as Error)?.message?.includes(
                'sqlglot not installed',
              ) ? (
                <Stack alignItems="flex-start" spacing={1}>
                  <Typography variant="caption">
                    Column lineage requires <b>sqlglot</b>.
                  </Typography>
                  <Button
                    size="small"
                    variant="outlined"
                    color="inherit"
                    onClick={handleInstallSqlglot}
                    disabled={isInstallingSqlglot}
                  >
                    {isInstallingSqlglot ? 'Installing...' : 'Install sqlglot'}
                  </Button>
                </Stack>
              ) : (
                `Failed to load lineage: ${(lineageError as Error)?.message || 'Unknown error'}`
              )}
            </Alert>
          )}
          {Object.keys(displayColumns).length === 0 && (
            <Typography variant="caption" color="text.secondary">
              No columns found in metadata. Load lineage to discover columns
              from SQL.
            </Typography>
          )}
          <List dense disablePadding sx={{ mb: compact ? 3 : 6 }}>
            {Object.values(displayColumns).map((column: any) => {
              const upstream = getUpstreamCols(column.name);
              const hasUpstream = upstream.length > 0;
              const isExpanded = expandedColumns.has(column.name);

              return (
                <React.Fragment key={column.name}>
                  <ListItem
                    disableGutters
                    dense
                    alignItems="center"
                    onMouseEnter={() => {
                      if (hasUpstream && onColumnHover) {
                        const nodeNames = upstream.map(([table]) => table);
                        onColumnHover(nodeNames);
                      }
                    }}
                    onMouseLeave={() => onColumnHover?.([])}
                  >
                    {hasFetchedLineage && (
                      <IconButton
                        size="small"
                        onClick={() => handleToggleColumn(column.name)}
                        disabled={!hasUpstream}
                        sx={{
                          mt: 0.5,
                          mr: 0.5,
                          visibility: hasUpstream ? 'visible' : 'hidden',
                        }}
                      >
                        {isExpanded ? (
                          <ExpandMoreIcon fontSize="small" />
                        ) : (
                          <ChevronRightIcon fontSize="small" />
                        )}
                      </IconButton>
                    )}
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight="medium">
                            {column.name}
                          </Typography>
                          {column.meta?.data_type && (
                            <Chip
                              size="small"
                              label={column.meta.data_type}
                              variant="outlined"
                              sx={{ height: 20, fontSize: 12 }}
                            />
                          )}
                        </Stack>
                      }
                      secondary={
                        <Box>
                          {column.description && (
                            <Typography
                              variant="caption"
                              display="block"
                              color="text.secondary"
                              sx={{
                                whiteSpace: 'pre-wrap',
                                mb: compact ? 0.25 : 0.5,
                              }}
                            >
                              {column.description}
                            </Typography>
                          )}
                        </Box>
                      }
                    />
                  </ListItem>
                  {hasUpstream && (
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ pl: 6, pb: compact ? 0.5 : 1, pr: 2 }}>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          sx={{ display: 'block', mb: 0.5 }}
                        >
                          Sourced from:
                        </Typography>
                        {upstream.map(([table, col], idx) => (
                          <Box
                            key={idx}
                            sx={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 0.5,
                            }}
                          >
                            <Typography
                              variant="caption"
                              sx={{ fontFamily: 'monospace' }}
                            >
                              {table}.{col}
                            </Typography>
                          </Box>
                        ))}
                      </Box>
                    </Collapse>
                  )}
                </React.Fragment>
              );
            })}
          </List>
        </Box>
      )}
    </Stack>
  );
};
