import React, { useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Edge,
  MarkerType,
  Node,
  useEdgesState,
  useNodesState,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { Box, useTheme } from '@mui/material';
import type { ErGraph, ErTable } from './buildErGraph';
import {
  ER_HEADER_HEIGHT,
  ER_NODE_WIDTH,
  ER_ROW_HEIGHT,
  ErTableNode,
  type ErTableNodeData,
  erSourceHandleId,
  erTargetHandleId,
} from './ErTableNode';

const nodeTypes = { erTable: ErTableNode };

const GAP = 60;

// Fitting never zooms in past 120%, so small schemas open at the same
// readable size as a mid-sized one instead of blown up.
const FIT_VIEW_OPTIONS = { maxZoom: 1.2 };

const tableHeight = (table: ErTable) =>
  ER_HEADER_HEIGHT + table.columns.length * ER_ROW_HEIGHT + 2;

/**
 * Tables with lines are laid out left to right by dagre, the tables they
 * point at on the left. Tables without lines go in a grid underneath, so a
 * schema with no relationships is not one very tall column.
 */
const layoutTables = (graph: ErGraph): Node<ErTable>[] => {
  const linkedIds = new Set<string>();
  graph.relationships.forEach((r) => {
    linkedIds.add(r.parentTableId);
    linkedIds.add(r.childTableId);
  });
  const linked = graph.tables.filter((t) => linkedIds.has(t.id));
  const unlinked = graph.tables.filter((t) => !linkedIds.has(t.id));

  const positions = new Map<string, { x: number; y: number }>();
  let bottom = 0;

  if (linked.length > 0) {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: 'LR', nodesep: GAP, ranksep: GAP * 2 });
    linked.forEach((table) =>
      dagreGraph.setNode(table.id, {
        width: ER_NODE_WIDTH,
        height: tableHeight(table),
      }),
    );
    graph.relationships.forEach((r) =>
      dagreGraph.setEdge(r.parentTableId, r.childTableId),
    );
    dagre.layout(dagreGraph);

    linked.forEach((table) => {
      const { x, y } = dagreGraph.node(table.id);
      const height = tableHeight(table);
      positions.set(table.id, { x: x - ER_NODE_WIDTH / 2, y: y - height / 2 });
      bottom = Math.max(bottom, y + height / 2);
    });
    bottom += GAP * 2;
  }

  const perRow = Math.max(1, Math.ceil(Math.sqrt(unlinked.length)));
  let rowTop = bottom;
  for (let start = 0; start < unlinked.length; start += perRow) {
    const row = unlinked.slice(start, start + perRow);
    const y = rowTop;
    row.forEach((table, index) =>
      positions.set(table.id, { x: index * (ER_NODE_WIDTH + GAP), y }),
    );
    rowTop += Math.max(...row.map(tableHeight)) + GAP;
  }

  return graph.tables.map((table) => ({
    id: table.id,
    type: 'erTable',
    data: table,
    position: positions.get(table.id) ?? { x: 0, y: 0 },
  }));
};

type Props = {
  graph: ErGraph;
  /** Table to highlight, e.g. the one whose page this is on. */
  focusTableId?: string;
};

export const ErDiagram: React.FC<Props> = ({ graph, focusTableId }) => {
  const theme = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const layoutedNodes = useMemo<Node<ErTableNodeData>[]>(
    () =>
      layoutTables(graph).map((node) => ({
        ...node,
        data: { ...node.data, isFocus: node.id === focusTableId },
      })),
    [graph, focusTableId],
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const realColor = theme.palette.primary.main;
    const guessedColor = theme.palette.text.secondary;
    return graph.relationships.map((r) => {
      const color = r.inferred ? guessedColor : realColor;
      return {
        id: r.id,
        source: r.parentTableId,
        sourceHandle: erSourceHandleId(r.parentColumn),
        target: r.childTableId,
        targetHandle: erTargetHandleId(r.childColumn),
        type: 'smoothstep',
        // The arrow points at the table that holds the key.
        markerStart: { type: MarkerType.ArrowClosed, color },
        style: {
          stroke: color,
          strokeWidth: 1.5,
          strokeDasharray: r.inferred ? '6 4' : undefined,
        },
      };
    });
  }, [graph, theme.palette.primary.main, theme.palette.text.secondary]);

  useEffect(() => {
    setNodes(layoutedNodes);
    setEdges(flowEdges);
  }, [layoutedNodes, flowEdges, setNodes, setEdges]);

  return (
    <Box sx={{ height: '100%', width: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        nodesConnectable={false}
        onlyRenderVisibleElements
        minZoom={0.05}
        fitView
        fitViewOptions={FIT_VIEW_OPTIONS}
      >
        <Controls showInteractive={false} fitViewOptions={FIT_VIEW_OPTIONS} />
        <Background color={theme.palette.text.disabled} gap={16} />
      </ReactFlow>
    </Box>
  );
};
