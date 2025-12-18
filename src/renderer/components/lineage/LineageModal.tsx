import React, { useMemo, useState, useEffect } from 'react';
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
  const [depth, setDepth] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();

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

  console.log('graphData', graphData);

  const selectedNode = useMemo(() => {
    if (!graphData?.nodes) {
      return undefined;
    }
    return (
      graphData.nodes.find((node) => node.uniqueId === selectedNodeId) ??
      graphData.nodes.find((node) => node.uniqueId === effectiveModelId)
    );
  }, [graphData?.nodes, selectedNodeId, effectiveModelId]);

  const { data: selectedNodeMetadata } = useLineageModelMetadata(
    {
      projectId,
      modelId: selectedNodeId ?? effectiveModelId ?? '',
    },
    { enabled: Boolean(selectedNodeId ?? effectiveModelId) },
  );

  console.log('selectedNodeMetadata', selectedNodeMetadata);

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
  };

  const handleDepthChange = (value: number) => {
    setDepth(value);
  };

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
            nodes={graphData?.nodes}
            edges={graphData?.edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
            isLoading={isGraphLoading}
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
