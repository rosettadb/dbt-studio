import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
  Node,
  Edge,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { Box, Stack, Skeleton, useTheme } from '@mui/material';
import type { LineageEdge, LineageNode } from '../../../types/lineage';
import { DbtNode } from './DbtNode';

type LineageGraphProps = {
  nodes?: LineageNode[];
  edges?: LineageEdge[];
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
  onNodeExpand?: (nodeId: string, direction: 'upstream' | 'downstream') => void;
  onNodeMouseEnter?: (nodeId: string) => void; // New trigger for prefetching
  highlightedNodeIds?: string[];
  isLoading?: boolean;
};

const nodeTypes = {
  dbtNode: DbtNode,
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 100;

export const LineageGraph: React.FC<LineageGraphProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  selectedNodeId,
  onSelectNode,
  onNodeExpand,
  onNodeMouseEnter,
  highlightedNodeIds,
  isLoading,
}) => {
  const theme = useTheme();

  // React Flow state
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  // Layout logic using Dagre
  const getLayoutedElements = useCallback(
    (flowNodes: Node[], flowEdges: Edge[]) => {
      const dagreGraph = new dagre.graphlib.Graph();
      dagreGraph.setDefaultEdgeLabel(() => ({}));

      dagreGraph.setGraph({ rankdir: 'LR' });

      flowNodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
      });

      flowEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
      });

      dagre.layout(dagreGraph);

      const layoutedNodes = flowNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
          ...node,
          targetPosition: Position.Left,
          sourcePosition: Position.Right,
          position: {
            x: nodeWithPosition.x - NODE_WIDTH / 2,
            y: nodeWithPosition.y - NODE_HEIGHT / 2,
          },
        };
      });

      return { nodes: layoutedNodes, edges: flowEdges };
    },
    [],
  );

  // Sync props to React Flow state
  useEffect(() => {
    if (!initialNodes || !initialEdges) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const flowNodes: Node[] = initialNodes.map((node) => ({
      id: node.uniqueId,
      type: 'dbtNode',
      data: {
        ...node,
        onExpand: onNodeExpand,
        isHighlighted: highlightedNodeIds?.includes(node.uniqueId),
      },
      position: { x: 0, y: 0 }, // Position will be calculated by layout
      selected: node.uniqueId === selectedNodeId,
    }));

    const flowEdges: Edge[] = initialEdges.map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: theme.palette.text.disabled,
      },
      style: { stroke: theme.palette.text.disabled },
    }));

    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
    );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
  }, [
    initialNodes,
    initialEdges,
    getLayoutedElements,
    setNodes,
    setEdges,
    theme.palette.text.disabled,
    theme.palette.text.disabled,
    onNodeExpand,
    highlightedNodeIds,
    // selectedNodeId removed to prevent re-layout on selection
  ]);

  // Handle selection changes efficiently without re-layout
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      })),
    );
  }, [selectedNodeId, setNodes]);

  // Handle selection
  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      onSelectNode?.(node.id);
    },
    [onSelectNode],
  );

  if (isLoading) {
    return (
      <Stack spacing={2} p={2}>
        <Skeleton variant="rectangular" height={300} />
      </Stack>
    );
  }

  if (!initialNodes || initialNodes.length === 0) {
    return (
      <Box
        sx={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: (t) => t.palette.text.secondary,
        }}
      >
        No lineage nodes found.
      </Box>
    );
  }

  return (
    <Box sx={{ height: '100%', width: '100%', minHeight: 400 }}>
      {/* 
        Must force height on container for React Flow to render correctly. 
        In parent, make sure this component has explicit height or flex grow. 
      */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) =>
          setNodes((nds) => applyNodeChanges(changes, nds))
        }
        onEdgesChange={(changes) =>
          setEdges((eds) => applyEdgeChanges(changes, eds))
        }
        onNodeClick={onNodeClick}
        onNodeMouseEnter={(_event, node) => onNodeMouseEnter?.(node.id)}
        nodeTypes={nodeTypes}
        fitView
      >
        <Controls />
        <Background color={theme.palette.text.disabled} gap={16} />
      </ReactFlow>
    </Box>
  );
};
