import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  Controls,
  ControlButton,
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
import { Box, Tooltip, useTheme } from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import type { PipelineJob } from './types';
import { PipelineNode } from './PipelineNode';

const nodeTypes = { pipelineNode: PipelineNode };

const NODE_WIDTH = 264;
const NODE_HEIGHT = 110;

type PipelineGraphProps = {
  jobs: PipelineJob[];
  onEdit?: () => void;
};

export const PipelineGraph: React.FC<PipelineGraphProps> = ({
  jobs,
  onEdit,
}) => {
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
    const flowNodes: Node[] = [];
    const flowEdges: Edge[] = [];

    // Flatten all jobs into a single node list, connecting jobs sequentially.
    // Between-job edges use a dashed style to visually separate job boundaries.
    let prevLastId: string | null = null;

    jobs.forEach((job, jobIndex) => {
      const steps = job.steps ?? [];
      const isCleanup = job.type?.toLowerCase() === 'cleanup';

      steps.forEach((step, stepIndex) => {
        const id = `${jobIndex}-${stepIndex}`;
        flowNodes.push({
          id,
          type: 'pipelineNode',
          data: { ...step, stepIndex, isCleanup },
          position: { x: 0, y: 0 },
        });

        // Edge within job: previous step → this step
        if (stepIndex > 0) {
          const prevId = `${jobIndex}-${stepIndex - 1}`;
          const targetIsRunning = step.status === 'running';
          flowEdges.push({
            id: `e-${prevId}-${id}`,
            source: prevId,
            target: id,
            type: 'smoothstep',
            animated: targetIsRunning,
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: targetIsRunning
                ? theme.palette.info.main
                : theme.palette.text.disabled,
            },
            style: {
              stroke: targetIsRunning
                ? theme.palette.info.main
                : theme.palette.text.disabled,
            },
          });
        }
      });

      // Edge between jobs: last step of previous job → first step of this job (dashed)
      const firstId = `${jobIndex}-0`;
      const firstStep = steps[0];
      const firstIsRunning = firstStep?.status === 'running';
      if (prevLastId !== null && steps.length > 0) {
        flowEdges.push({
          id: `e-${prevLastId}-${firstId}`,
          source: prevLastId,
          target: firstId,
          type: 'smoothstep',
          animated: firstIsRunning,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: firstIsRunning
              ? theme.palette.info.main
              : theme.palette.text.disabled,
          },
          style: {
            stroke: firstIsRunning
              ? theme.palette.info.main
              : theme.palette.text.disabled,
            strokeDasharray: '5 4',
          },
        });
      }

      if (steps.length > 0) {
        prevLastId = `${jobIndex}-${steps.length - 1}`;
      }
    });

    const { nodes: laid, edges: laidEdges } = getLayoutedElements(
      flowNodes,
      flowEdges,
    );
    setNodes(laid);
    setEdges(laidEdges);
  }, [
    jobs,
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
        <Controls>
          {onEdit && (
            <Tooltip title="Edit pipeline.yml" placement="right">
              <ControlButton onClick={onEdit}>
                <EditIcon style={{ maxWidth: 12, maxHeight: 12 }} />
              </ControlButton>
            </Tooltip>
          )}
        </Controls>
        <Background color={theme.palette.text.disabled} gap={16} />
      </ReactFlow>
    </Box>
  );
};
