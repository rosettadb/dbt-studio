import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Box, Divider, Grid, Typography, Alert } from '@mui/material';
import { Modal } from '../modals/modal';
import { LineageToolbar } from './LineageToolbar';
import { LineageGraph } from './LineageGraph';
import { NodeDetailsPanel } from './NodeDetailsPanel';
import {
  useFullLineage,
  useLineageModelMetadata,
  useCurrentModelId,
} from '../../controllers/lineage.controller';
import { lineageService } from '../../services';
import type { LineageNode, LineageEdge } from '../../../types/lineage';
import { DEFAULT_LINEAGE_SETTINGS } from '../../config/constants';

type LineageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  projectId?: string;
  modelId?: string;
  filePath?: string;
};

export const LineageModal: React.FC<LineageModalProps> = ({
  isOpen,
  onClose,
  projectId,
  modelId: initialModelId,
  filePath,
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
  useEffect(() => {
    if (effectiveModelId && !selectedNodeId) {
      setSelectedNodeId(effectiveModelId);
    }
  }, [effectiveModelId, selectedNodeId]);

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
    refetch: refetchGraph,
    error: graphError,
  } = useFullLineage(requestPayload, {
    enabled: Boolean(effectiveModelId),
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
    { enabled: Boolean(selectedNodeId ?? effectiveModelId) },
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
        console.error('Failed to expand node:', error);
      } finally {
        setIsExpanding(false);
      }
    },
    [projectId],
  );

  const renderContent = (): React.ReactNode => {
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
      <Grid container spacing={2} sx={{ mt: 1, height: '100%' }}>
        <Grid item xs={12} md={7} lg={8} sx={{ maxHeight: '70vh' }}>
          <LineageGraph
            nodes={localGraph.nodes}
            edges={localGraph.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            onNodeExpand={handleNodeExpand}
            isLoading={isGraphLoading || isExpanding}
          />
        </Grid>
        <Grid item xs={12} md={5} lg={4} sx={{ maxHeight: '70vh' }}>
          <NodeDetailsPanel node={selectedNodeMetadata ?? selectedNode} />
        </Grid>
      </Grid>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Model Lineage"
      hideHeader
      fullScreen
      maxWidth="xl"
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{ px: 3, pt: 3 }}>
          <Typography variant="h6">Model Lineage</Typography>
          <Typography variant="body2" color="text.secondary">
            Explore upstream and downstream relationships for your dbt model.
          </Typography>
        </Box>

        <Box sx={{ px: 3, pt: 2 }}>
          <LineageToolbar
            depth={depth}
            onDepthChange={handleDepthChange}
            onRefresh={() => refetchGraph()}
            isRefreshing={isGraphLoading}
            disabled={!effectiveModelId}
          />
        </Box>

        {!!graphError && (
          <Box sx={{ px: 3, pt: 2 }}>
            <Alert severity="error">
              Failed to load lineage. Please try refreshing.
            </Alert>
          </Box>
        )}

        <Divider sx={{ mt: 2 }} />
        <Box sx={{ flex: 1, px: 3, pb: 3 }}>{renderContent()}</Box>
      </Box>
    </Modal>
  );
};
