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
import { Box, useTheme } from '@mui/material';
import type { PipelineJob } from './types';
import { PipelineNode } from './PipelineNode';

const nodeTypes = { pipelineNode: PipelineNode };

const NODE_WIDTH = 264;
const NODE_HEIGHT = 110;

type PipelineGraphProps = {
  job: PipelineJob;
};

export const PipelineGraph: React.FC<PipelineGraphProps> = ({ job }) => {
  const theme = useTheme();
  const [nodes, setNodes] = useNodesState([]);
  const [edges, setEdges] = useEdgesState([]);

  const getLayoutedElements = useCallback(
    (flowNodes: Node[], flowEdges: Edge[]) => {
      const g = new dagre.graphlib.Graph();
      g.setDefaultEdgeLabel(() => ({}));
      g.setGraph({ rankdir: 'LR', ranksep: 60, nodesep: 30 });

      flowNodes.forEach((n) =>
        g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }),
      );
      flowEdges.forEach((e) => g.setEdge(e.source, e.target));
      dagre.layout(g);

      return {
        nodes: flowNodes.map((n) => {
          const pos = g.node(n.id);
          return {
            ...n,
            targetPosition: Position.Left,
            sourcePosition: Position.Right,
            position: {
              x: pos.x - NODE_WIDTH / 2,
              y: pos.y - NODE_HEIGHT / 2,
            },
          };
        }),
        edges: flowEdges,
      };
    },
    [],
  );

  useEffect(() => {
    const steps = job.steps ?? [];

    // Each step gets a stable id based on its index within this job
    const flowNodes: Node[] = steps.map((step, i) => ({
      id: String(i),
      type: 'pipelineNode',
      data: { ...step, stepIndex: i },
      position: { x: 0, y: 0 },
    }));

    // Sequential edges: step[i] → step[i+1]
    const flowEdges: Edge[] = steps.slice(0, -1).map((_, i) => ({
      id: `e${i}-${i + 1}`,
      source: String(i),
      target: String(i + 1),
      type: 'smoothstep',
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: theme.palette.text.disabled,
      },
      style: { stroke: theme.palette.text.disabled },
    }));

    const { nodes: laid, edges: laidEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
    );
    setNodes(laid);
    setEdges(laidEdges);
  }, [
    job,
    getLayoutedElements,
    setNodes,
    setEdges,
    theme.palette.text.disabled,
  ]);

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={(changes) =>
          setNodes((nds) => applyNodeChanges(changes, nds))
        }
        onEdgesChange={(changes) =>
          setEdges((eds) => applyEdgeChanges(changes, eds))
        }
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
      >
        <Controls />
        <Background color={theme.palette.text.disabled} gap={16} />
      </ReactFlow>
    </Box>
  );
};
