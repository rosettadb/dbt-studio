import React from 'react';
import {
  Box,
  Button,
  List,
  ListItemButton,
  ListItemText,
  Typography,
} from '@mui/material';
import { Add, InsertChartOutlined } from '@mui/icons-material';
import type { Project } from '../../../types/backend';
import { useDbtChartsProjectState } from '../../controllers';
import { ChartsStateGate } from './ChartsSetupStates';
import { NewBoardDialog } from './NewBoardDialog';

type Props = {
  project?: Project;
  /** Opens a project file (absolute path) as an editor tab. */
  onOpenFile?: (absolutePath: string) => void;
};

const ReadyList: React.FC<Props> = ({ project, onOpenFile }) => {
  const { data: state } = useDbtChartsProjectState(project?.id);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const boards = state?.boards ?? [];
  const abs = (rel: string) => `${project?.path}/${rel}`;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 1, borderBottom: 1, borderColor: 'divider' }}>
        <Button
          fullWidth
          size="small"
          variant="contained"
          startIcon={<Add />}
          onClick={() => setDialogOpen(true)}
          data-testid="dbt-charts-new-board-btn"
        >
          New board
        </Button>
      </Box>
      <List
        dense
        sx={{ flex: 1, overflow: 'auto' }}
        data-testid="dbt-charts-board-list"
      >
        {boards.length === 0 && (
          <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
            No boards yet.
          </Typography>
        )}
        {boards.map((rel) => (
          <ListItemButton
            key={rel}
            onClick={() => onOpenFile?.(abs(rel))}
            data-testid={`dbt-charts-board-${rel}`}
          >
            <InsertChartOutlined
              fontSize="small"
              sx={{ mr: 1, opacity: 0.7 }}
            />
            <ListItemText
              primary={rel.replace(/^charts\//, '')}
              primaryTypographyProps={{ variant: 'body2' }}
            />
          </ListItemButton>
        ))}
      </List>
      {project && (
        <NewBoardDialog
          open={dialogOpen}
          projectId={project.id}
          existingBoards={boards}
          onClose={() => setDialogOpen(false)}
          onCreated={(p) => onOpenFile?.(p)}
        />
      )}
    </Box>
  );
};

export const ChartsSidebarPanel: React.FC<Props> = ({
  project,
  onOpenFile,
}) => (
  <Box sx={{ height: '100%', overflow: 'auto' }} data-testid="dbt-charts-panel">
    <ChartsStateGate project={project} onSetupDone={(p) => onOpenFile?.(p)}>
      <ReadyList project={project} onOpenFile={onOpenFile} />
    </ChartsStateGate>
  </Box>
);
