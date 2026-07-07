import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useQueryClient } from 'react-query';
import {
  Box,
  Typography,
  Alert,
  Button,
  IconButton,
  Tooltip,
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import { LineageToolbar } from './LineageToolbar';
import { LineageGraph } from './LineageGraph';
import { NodeDetailsPanel } from './NodeDetailsPanel';
import {
  useFullLineage,
  useLineageModelMetadata,
  useCurrentModelId,
  useLineagePrefetch,
} from '../../controllers/lineage.controller';
import { lineageService } from '../../services';
import type { LineageNode, LineageEdge } from '../../../types/lineage';
import { DEFAULT_LINEAGE_SETTINGS, QUERY_KEYS } from '../../config/constants';

type LineageViewProps = {
  projectId?: string;
  modelId?: string;
  filePath?: string;
  onExpandClick?: () => void;
};

export const LineageView: React.FC<LineageViewProps> = ({
  projectId,
  modelId: initialModelId,
  filePath,
  onExpandClick,
}) => {
  const [depth, setDepth] = useState(
    DEFAULT_LINEAGE_SETTINGS.lineageDefaults.depth,
  );
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [localGraph, setLocalGraph] = useState<{
    nodes: LineageNode[];
    edges: LineageEdge[];
  }>({ nodes: [], edges: [] });
  const [isExpanding, setIsExpanding] = useState(false);
  const [highlightedNodeIds, setHighlightedNodeIds] = useState<string[]>([]);

  const { prefetchNeighbors } = useLineagePrefetch();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries([QUERY_KEYS.GET_LINEAGE_CURRENT_MODEL]),
        queryClient.invalidateQueries([QUERY_KEYS.GET_LINEAGE_UPSTREAM]),
        queryClient.invalidateQueries([QUERY_KEYS.GET_LINEAGE_DOWNSTREAM]),
        queryClient.invalidateQueries([QUERY_KEYS.GET_LINEAGE_FULL]),
        queryClient.invalidateQueries([QUERY_KEYS.GET_LINEAGE_METADATA]),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  }, [queryClient]);

  const handleNodeMouseEnter = (nodeId: string) => {
    if (!projectId) return;
    prefetchNeighbors({ projectId, modelId: nodeId });
  };

  const handleColumnHover = useCallback(
    (nodeNames: string[]) => {
      if (nodeNames.length === 0) {
        setHighlightedNodeIds([]);
        return;
      }
      // Resolve names to uniqueIds locally
      const ids = localGraph.nodes
        .filter(
          (n) => nodeNames.includes(n.name) || nodeNames.includes(n.uniqueId),
        )
        .map((n) => n.uniqueId);

      setHighlightedNodeIds(ids);
    },
    [localGraph.nodes],
  );

  // Resolve modelId if filePath is provided
  const { data: currentModelData } = useCurrentModelId(
    {
      projectId,
      filePath,
    },
    {
      enabled: Boolean(projectId && filePath && !initialModelId),
    },
  );

  const effectiveModelId = initialModelId ?? currentModelData?.modelId;

  // Initialize selectedNodeId when modelId becomes available
  // Sync selectedNodeId when modelId changes
  useEffect(() => {
    if (effectiveModelId) {
      setSelectedNodeId(effectiveModelId);
    }
  }, [effectiveModelId]);

  const requestPayload = useMemo(
    () => ({
      projectId,
      modelId: effectiveModelId ?? '',
      depth,
    }),
    [projectId, effectiveModelId, depth],
  );

  const {
    data: graphData,
    isLoading: isGraphLoading,
    error: graphError,
  } = useFullLineage(requestPayload, {
    enabled: Boolean(effectiveModelId && projectId),
    keepPreviousData: false,
  });
  // Sync graphData to local state when it changes
  useEffect(() => {
    if (graphData) {
      setLocalGraph(graphData);
    }
  }, [graphData]);

  const selectedNode = useMemo(() => {
    if (!localGraph.nodes.length) {
      return undefined;
    }
    return (
      localGraph.nodes.find((node) => node.uniqueId === selectedNodeId) ??
      localGraph.nodes.find((node) => node.uniqueId === effectiveModelId)
    );
  }, [localGraph.nodes, selectedNodeId, effectiveModelId]);

  const { data: selectedNodeMetadata } = useLineageModelMetadata(
    {
      projectId,
      modelId: selectedNodeId ?? effectiveModelId ?? '',
    },
    { enabled: Boolean(projectId && (selectedNodeId ?? effectiveModelId)) },
  );

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleDepthChange = (value: number) => {
    setDepth(value);
  };

  const handleNodeExpand = useCallback(
    async (nodeId: string, direction: 'upstream' | 'downstream') => {
      if (!projectId) return;
      setIsExpanding(true);
      try {
        const result =
          direction === 'upstream'
            ? await lineageService.getUpstreamLineage({
                projectId,
                modelId: nodeId,
                depth: 1,
              })
            : await lineageService.getDownstreamLineage({
                projectId,
                modelId: nodeId,
                depth: 1,
              });

        setLocalGraph((prev) => {
          const newNodes = [...prev.nodes];
          const newEdges = [...prev.edges];

          result.nodes.forEach((node) => {
            if (!newNodes.find((n) => n.uniqueId === node.uniqueId)) {
              newNodes.push(node);
            }
          });

          result.edges.forEach((edge) => {
            if (
              !newEdges.find(
                (e) => e.source === edge.source && e.target === edge.target,
              )
            ) {
              newEdges.push(edge);
            }
          });

          return { nodes: newNodes, edges: newEdges };
        });
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Failed to expand node:', error);
      } finally {
        setIsExpanding(false);
      }
    },
    [projectId],
  );

  const renderContent = (): React.ReactNode => {
    // If manifest is missing, prompt user to run dbt
    if (currentModelData?.error === 'MANIFEST_NOT_FOUND') {
      return (
        <Box
          sx={{
            py: 6,
            px: 4,
            display: 'flex',
            justifyContent: 'center',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Alert severity="warning" variant="outlined" sx={{ maxWidth: 600 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              dbt Manifest Not Found
            </Typography>
            <Typography variant="body2">
              Lineage requires a compiled manifest file. Please run{' '}
              <code style={{ fontWeight: 'bold' }}>dbt compile</code> or{' '}
              <code style={{ fontWeight: 'bold' }}>dbt run</code> in your
              project to generate it.
            </Typography>
          </Alert>
        </Box>
      );
    }

    if (currentModelData?.error === 'MODEL_NOT_FOUND') {
      return (
        <Box
          sx={{
            py: 6,
            px: 4,
            display: 'flex',
            justifyContent: 'center',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 2,
          }}
        >
          <Alert severity="info" variant="outlined" sx={{ maxWidth: 600 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
              Model Not Found in Manifest
            </Typography>
            <Typography variant="body2">
              This model was not found in the compiled `manifest.json`.
              <br />
              Please run <code style={{ fontWeight: 'bold' }}>
                dbt compile
              </code>{' '}
              or <code style={{ fontWeight: 'bold' }}>dbt run</code> to include
              this model in the project lineage.
            </Typography>
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
              <Button
                variant="outlined"
                color="inherit"
                size="small"
                startIcon={<RefreshIcon />}
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                Refresh Manifest
              </Button>
            </Box>
          </Alert>
        </Box>
      );
    }

    if (!effectiveModelId) {
      return (
        <Box
          sx={{
            py: 6,
            display: 'flex',
            justifyContent: 'center',
            color: (theme) => theme.palette.text.secondary,
          }}
        >
          Select a model before opening lineage.
        </Box>
      );
    }

    return (
      <Box sx={{ display: 'flex', height: '100%', overflow: 'hidden', mt: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0, height: '100%' }}>
          <LineageGraph
            nodes={localGraph.nodes}
            edges={localGraph.edges}
            selectedNodeId={selectedNodeId}
            highlightedNodeIds={highlightedNodeIds}
            onSelectNode={handleSelectNode}
            onNodeExpand={handleNodeExpand}
            onNodeMouseEnter={handleNodeMouseEnter}
            isLoading={isGraphLoading || isExpanding}
          />
        </Box>
        <Box
          sx={{
            width: 350,
            borderLeft: 1,
            borderColor: 'divider',
            height: '100%',
            overflow: onExpandClick ? 'hidden' : 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {onExpandClick && (
            <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
              <LineageToolbar
                depth={depth}
                onDepthChange={handleDepthChange}
                onRefresh={handleRefresh}
                isRefreshing={isRefreshing}
                disabled={isRefreshing}
                extraActions={
                  <Tooltip title="Maximize">
                    <IconButton onClick={onExpandClick} size="small">
                      <FullscreenIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              />
            </Box>
          )}
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <NodeDetailsPanel
              node={selectedNodeMetadata ?? selectedNode}
              projectId={projectId}
              onColumnHover={handleColumnHover}
              compact={Boolean(onExpandClick)}
            />
          </Box>
        </Box>
      </Box>
    );
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Show this on large screen on modal, hide it on the smal terminal window */}
      {!onExpandClick && (
        <Box sx={{ px: 2, pt: 2 }}>
          <LineageToolbar
            depth={depth}
            onDepthChange={handleDepthChange}
            onRefresh={handleRefresh}
            isRefreshing={isRefreshing}
            disabled={isRefreshing}
          />
        </Box>
      )}

      {!!graphError && (
        <Box sx={{ px: 2, pt: 1 }}>
          <Alert severity="error">
            Failed to load lineage. Please try refreshing.
          </Alert>
        </Box>
      )}

      <Box sx={{ flex: 1, px: 2, pb: 2, overflow: 'hidden' }}>
        {renderContent()}
      </Box>
    </Box>
  );
};
