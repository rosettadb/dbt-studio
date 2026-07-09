import React, { useCallback, useEffect } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  Controls,
  ControlButton,
  Background,
  useNodesState,
  useEdgesState,
  useReactFlow,
  MarkerType,
  Node,
  Edge,
  Position,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  NodeChange,
  EdgeChange,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import {
  Box,
  Tooltip,
  useTheme,
  Button,
  IconButton,
  TextField,
  Typography,
} from '@mui/material';
import type { Theme } from '@mui/material';
import CodeIcon from '@mui/icons-material/Code';
import AutoFixHighIcon from '@mui/icons-material/AutoFixHigh';
import SaveIcon from '@mui/icons-material/Save';
import type { PipelineJob } from './types';
import { PipelineNode, type PipelineNodeData } from './PipelineNode';
import { NodePalette } from './NodePalette';
import { StepEditDialog } from './StepEditDialog';
import { PLUGIN_MAP } from './pluginDefinitions';
import { serializePipelineConfig } from './serializePipeline';
import { validatePipelineGraph } from './validatePipeline';
import { useTerminalMinimize } from '../terminal';

const nodeTypes = { pipelineNode: PipelineNode };

const NODE_WIDTH = 264;
const NODE_HEIGHT = 110;

type PipelineGraphProps = {
  jobs: PipelineJob[];
  pipelineName: string;
  onEdit?: () => void;
  onSave?: (content: string) => Promise<void>;
};

function getLayoutedElements(flowNodes: Node[], flowEdges: Edge[]) {
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
        position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 },
      };
    }),
    edges: flowEdges,
  };
}

function buildNodesAndEdges(
  jobs: PipelineJob[],
  theme: Theme,
): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const flowNodes: Node<PipelineNodeData>[] = [];
  const flowEdges: Edge[] = [];
  let prevLastId: string | null = null;

  jobs.forEach((job, jobIndex) => {
    const steps = job.steps ?? [];
    const isCleanup = job.type?.toLowerCase() === 'cleanup';

    steps.forEach((step, stepIndex) => {
      const id = `${jobIndex}-${stepIndex}`;
      flowNodes.push({
        id,
        type: 'pipelineNode',
        data: {
          ...step,
          stepIndex,
          isCleanup,
          jobName: job.name,
          jobType: job.type,
        },
        position: { x: 0, y: 0 },
      });

      if (stepIndex > 0) {
        const prevId = `${jobIndex}-${stepIndex - 1}`;
        const running = step.status === 'running';
        flowEdges.push({
          id: `e-${prevId}-${id}`,
          source: prevId,
          target: id,
          type: 'smoothstep',
          animated: running,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: running
              ? theme.palette.info.main
              : theme.palette.text.disabled,
          },
          style: {
            stroke: running
              ? theme.palette.info.main
              : theme.palette.text.disabled,
          },
        });
      }
    });

    const firstId = `${jobIndex}-0`;
    const firstStep = steps[0];
    const firstRunning = firstStep?.status === 'running';
    if (prevLastId !== null && steps.length > 0) {
      flowEdges.push({
        id: `e-${prevLastId}-${firstId}`,
        source: prevLastId,
        target: firstId,
        type: 'smoothstep',
        animated: firstRunning,
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: firstRunning
            ? theme.palette.info.main
            : theme.palette.text.disabled,
        },
        style: {
          stroke: firstRunning
            ? theme.palette.info.main
            : theme.palette.text.disabled,
          strokeDasharray: '5 4',
        },
      });
    }

    if (steps.length > 0) prevLastId = `${jobIndex}-${steps.length - 1}`;
  });

  return { nodes: flowNodes, edges: flowEdges };
}

// Inner component — needs to be inside ReactFlowProvider to use useReactFlow
const PipelineGraphContent: React.FC<PipelineGraphProps> = ({
  jobs,
  pipelineName: initialPipelineName,
  onEdit,
  onSave,
}) => {
  const theme = useTheme();
  const { project } = useReactFlow();
  const terminal = useTerminalMinimize();
  const autoMinimizedRef = React.useRef(false);

  const [nodes, setNodes] = useNodesState<PipelineNodeData>([]);
  const [edges, setEdges] = useEdgesState([]);
  const [isEditing, setIsEditing] = React.useState(false);
  const [pipelineName, setPipelineName] = React.useState(initialPipelineName);
  const [editNode, setEditNode] = React.useState<Node<PipelineNodeData> | null>(
    null,
  );
  const [validationError, setValidationError] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);

  const reactFlowWrapper = React.useRef<HTMLDivElement>(null);
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;

  const openEditForNode = useCallback((id: string) => {
    const node = nodesRef.current.find((n) => n.id === id);
    if (node) setEditNode(node as Node<PipelineNodeData>);
  }, []);

  // Read mode: rebuild whenever jobs change
  useEffect(() => {
    if (isEditing) return;
    const { nodes: built, edges: builtEdges } = buildNodesAndEdges(jobs, theme);
    const { nodes: laid, edges: laidEdges } = getLayoutedElements(
      built,
      builtEdges,
    );
    setNodes(laid);
    setEdges(laidEdges);
  }, [jobs, isEditing, theme, setNodes, setEdges]);

  // Keep pipeline name in sync when not editing
  useEffect(() => {
    if (!isEditing) setPipelineName(initialPipelineName);
  }, [initialPipelineName, isEditing]);

  const handleEnterEdit = useCallback(() => {
    const { nodes: built, edges: builtEdges } = buildNodesAndEdges(jobs, theme);
    const { nodes: laid, edges: laidEdges } = getLayoutedElements(
      built,
      builtEdges,
    );
    setNodes(
      laid.map((n) => ({
        ...n,
        data: {
          ...n.data,
          editMode: true,
          onEditClick: () => openEditForNode(n.id),
        },
      })),
    );
    setEdges(laidEdges);
    setPipelineName(initialPipelineName);
    setValidationError('');
    setIsEditing(true);
    if (terminal && !terminal.isMinimized) {
      terminal.minimize();
      autoMinimizedRef.current = true;
    }
  }, [jobs, theme, initialPipelineName, setNodes, setEdges, terminal]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setValidationError('');
    if (autoMinimizedRef.current) {
      terminal?.restore();
      autoMinimizedRef.current = false;
    }
  }, [terminal]);

  const handleSave = useCallback(async () => {
    const errors = validatePipelineGraph(nodes, edges);
    if (errors.length > 0) {
      setValidationError(errors[0].message);
      return;
    }
    setValidationError('');
    setIsSaving(true);
    try {
      const content = serializePipelineConfig(pipelineName, nodes, edges);
      await onSave?.(content);
      setIsEditing(false);
      if (autoMinimizedRef.current) {
        terminal?.restore();
        autoMinimizedRef.current = false;
      }
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, onSave, terminal]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!isEditing) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: theme.palette.text.disabled,
            },
            style: { stroke: theme.palette.text.disabled },
          },
          eds,
        ),
      );
    },
    [isEditing, setEdges, theme],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const pluginId =
        event.dataTransfer.getData('application/pipeline-plugin') ||
        event.dataTransfer.getData('text/plain');
      if (!pluginId) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;
      const position = project({
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      });

      const def = PLUGIN_MAP.get(pluginId);
      const defaultJobName =
        nodes.find((n) => !n.data.isCleanup)?.data.jobName ?? 'run';
      const firstCommandField = def?.fields.find((f) => f.key === 'command');

      const newId = `node-${Date.now()}`;
      const newNode: Node<PipelineNodeData> = {
        id: newId,
        type: 'pipelineNode',
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          name: `New ${def?.label ?? pluginId} step`,
          plugin: pluginId,
          command: firstCommandField?.defaultValue ?? '',
          working_dir: '',
          stepIndex: nodes.length,
          jobName: defaultJobName,
          editMode: true,
          onEditClick: () => openEditForNode(newId),
        } as PipelineNodeData,
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [project, nodes, setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!isEditing) return;
      setEditNode(node as Node<PipelineNodeData>);
    },
    [isEditing],
  );

  const handleDialogSave = useCallback(
    (updated: Partial<PipelineNodeData>) => {
      if (!editNode) return;
      setNodes((nds) =>
        nds.map((n) => {
          if (n.id !== editNode.id) return n;
          return {
            ...n,
            data: {
              ...n.data,
              ...updated,
              isCleanup: updated.jobType?.toLowerCase() === 'cleanup',
              editMode: true,
              onEditClick: n.data.onEditClick,
            },
          };
        }),
      );
      setEditNode(null);
    },
    [editNode, setNodes],
  );

  const existingJobNames = React.useMemo(
    () =>
      [
        ...new Set(nodes.map((n) => n.data.jobName).filter(Boolean)),
      ] as string[],
    [nodes],
  );

  const handlePaletteAdd = useCallback(
    (pluginId: string) => {
      const def = PLUGIN_MAP.get(pluginId);
      const defaultJobName =
        nodes.find((n) => !n.data.isCleanup)?.data.jobName ?? 'run';
      const firstCommandField = def?.fields.find((f) => f.key === 'command');
      const offset = nodes.length * 30;
      const newId = `node-${Date.now()}`;
      setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type: 'pipelineNode',
          position: { x: 50 + offset, y: 50 + offset },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            name: `New ${def?.label ?? pluginId} step`,
            plugin: pluginId,
            command: firstCommandField?.defaultValue ?? '',
            working_dir: '',
            stepIndex: nodes.length,
            jobName: defaultJobName,
            editMode: true,
            onEditClick: () => openEditForNode(newId),
          } as PipelineNodeData,
        },
      ]);
    },
    [nodes, setNodes, openEditForNode],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) =>
      setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) =>
      setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );

  return (
    <Box
      sx={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
      onDrop={isEditing ? onDrop : undefined}
      onDragOver={isEditing ? onDragOver : undefined}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 0.75,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
          flexShrink: 0,
        }}
      >
        {isEditing ? (
          <TextField
            label="Pipeline Name"
            value={pipelineName}
            onChange={(e) => setPipelineName(e.target.value)}
            size="small"
            sx={{ width: 200 }}
            InputLabelProps={{ shrink: true }}
          />
        ) : (
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {pipelineName}
          </Typography>
        )}
        {isEditing && validationError ? (
          <Typography
            variant="caption"
            color="error"
            sx={{ flex: 1, fontSize: '0.7rem' }}
          >
            {validationError}
          </Typography>
        ) : (
          <Typography
            variant="caption"
            sx={{ flex: 1, color: 'text.disabled', fontSize: '0.65rem' }}
          >
            {isEditing
              ? 'Double-click a step to edit · Del to remove selected'
              : ''}
          </Typography>
        )}
        {onEdit && (
          <Tooltip title="View as YAML">
            <IconButton size="small" onClick={onEdit}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
        {isEditing && (
          <>
            <Button size="small" onClick={handleCancelEdit} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={isSaving}
              startIcon={<SaveIcon sx={{ fontSize: 14 }} />}
            >
              {isSaving ? 'Saving…' : 'Save'}
            </Button>
          </>
        )}
      </Box>

      <Box
        sx={{ flex: 1, minHeight: 0, display: 'flex' }}
        onDragOver={isEditing ? onDragOver : undefined}
      >
        {isEditing && <NodePalette onAdd={handlePaletteAdd} />}
        <Box
          ref={reactFlowWrapper}
          sx={{ flex: 1, minHeight: 0 }}
          onDragOver={isEditing ? onDragOver : undefined}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeDoubleClick={onNodeDoubleClick}
            onDrop={isEditing ? onDrop : undefined}
            onDragOver={isEditing ? onDragOver : undefined}
            nodeTypes={nodeTypes}
            deleteKeyCode={isEditing ? ['Delete', 'Backspace'] : null}
            nodesDraggable={isEditing}
            nodesConnectable={isEditing}
            fitView
            fitViewOptions={{ padding: 0.15 }}
          >
            <Controls>
              {!isEditing && onSave && (
                <Tooltip title="Visual edit pipeline" placement="right">
                  <ControlButton onClick={handleEnterEdit}>
                    <AutoFixHighIcon style={{ maxWidth: 14, maxHeight: 14 }} />
                  </ControlButton>
                </Tooltip>
              )}
            </Controls>
            <Background color={theme.palette.text.disabled} gap={16} />
          </ReactFlow>
        </Box>
      </Box>

      <StepEditDialog
        open={!!editNode}
        data={editNode?.data ?? null}
        existingJobNames={existingJobNames}
        onClose={() => setEditNode(null)}
        onSave={handleDialogSave}
      />
    </Box>
  );
};

export const PipelineGraph: React.FC<PipelineGraphProps> = ({
  jobs,
  pipelineName,
  onEdit,
  onSave,
}) => (
  <ReactFlowProvider>
    <PipelineGraphContent
      jobs={jobs}
      pipelineName={pipelineName}
      onEdit={onEdit}
      onSave={onSave}
    />
  </ReactFlowProvider>
);
