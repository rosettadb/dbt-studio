import React from 'react';
import ReactFlow, { ReactFlowProvider, Background } from 'reactflow';
import {
  Box,
  CircularProgress,
  Paper,
  Typography,
  useTheme,
} from '@mui/material';
import 'reactflow/dist/style.css';
import { getFileContent } from '../../services/projects.service';
import { parsePipelineConfig } from '../pipelineView/parsePipelineConfig';
import {
  buildNodesAndEdges,
  getLayoutedElements,
  nodeTypes,
} from '../pipelineView/PipelineGraph';

type PipelineThumbnailPreviewProps = {
  filePath: string;
};

// Lazily fetches and renders a small, read-only preview of a pipeline graph.
// Mounted only while a Tooltip is open, so failures here must stay contained
// and never surface as an error to the surrounding file tree.
export const PipelineThumbnailPreview: React.FC<
  PipelineThumbnailPreviewProps
> = ({ filePath }) => {
  const theme = useTheme();
  const [state, setState] = React.useState<
    | { status: 'loading' }
    | { status: 'error' }
    | {
        status: 'ready';
        name: string;
        nodes: ReturnType<typeof buildNodesAndEdges>['nodes'];
        edges: ReturnType<typeof buildNodesAndEdges>['edges'];
      }
  >({ status: 'loading' });

  React.useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });

    getFileContent({ path: filePath })
      .then((content) => {
        if (cancelled) return undefined;
        const config = parsePipelineConfig(content);
        if (!config) {
          setState({ status: 'error' });
          return undefined;
        }
        const { nodes: built, edges: builtEdges } = buildNodesAndEdges(
          config.jobs,
          theme,
        );
        const { nodes: laid, edges: laidEdges } = getLayoutedElements(
          built,
          builtEdges,
        );
        setState({
          status: 'ready',
          name: config.name,
          nodes: laid,
          edges: laidEdges,
        });
        return undefined;
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [filePath, theme]);

  return (
    <Paper
      elevation={8}
      sx={{
        width: 220,
        height: 150,
        borderRadius: 1.5,
        overflow: 'hidden',
        border: `1px solid ${theme.palette.divider}`,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {state.status === 'ready' && (
        <Box
          sx={{
            px: 1.25,
            py: 0.75,
            borderBottom: `1px solid ${theme.palette.divider}`,
            bgcolor: theme.palette.background.default,
            flexShrink: 0,
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 700, color: 'text.primary' }}
            noWrap
          >
            {state.name}
          </Typography>
        </Box>
      )}
      <Box
        sx={{ flex: 1, minHeight: 0, bgcolor: theme.palette.background.paper }}
      >
        {state.status === 'loading' && (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CircularProgress size={20} />
          </Box>
        )}
        {state.status === 'error' && (
          <Box
            sx={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Typography variant="caption" color="text.secondary">
              Preview unavailable
            </Typography>
          </Box>
        )}
        {state.status === 'ready' && (
          <ReactFlowProvider>
            <ReactFlow
              nodes={state.nodes}
              edges={state.edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.05}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
            >
              <Background color={theme.palette.text.disabled} gap={16} />
            </ReactFlow>
          </ReactFlowProvider>
        )}
      </Box>
    </Paper>
  );
};
