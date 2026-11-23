import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  useTheme,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { ReactComponent as RouteIcon } from './assets/route.svg';
import { useAppContext } from '../../../extensionApi/studio/hooks';
import type { DashboardCard } from '../../../extensionApi/renderer';
import { pipelineRunStore, usePipelineRunState } from './pipelineRunStore';

/** Opens the Create Pipeline dialog of the project screen. */
export const PIPELINE_CREATE_COMMAND = 'pipeline.create';

// What the project list does once a project is picked or created from the
// Home card: open it and run the command.
const AFTER_OPEN = {
  command: PIPELINE_CREATE_COMMAND,
  message: 'Pick the project to add a pipeline to, or create a new one.',
};

const goToProjectList = (
  navigate: NavigateFunction,
  openSidebar: () => void,
  startNewProject: boolean,
) => {
  openSidebar();
  navigate('/app/select-project', {
    state: { afterOpen: AFTER_OPEN, startNewProject },
  });
};

const PipelineCardIcon: React.FC = () => {
  const theme = useTheme();
  return (
    <RouteIcon
      width={28}
      height={28}
      style={{ color: theme.palette.primary.main }}
    />
  );
};

// The Pipeline card on Home. A pipeline lives in a project, so the card
// first settles which project: straight to the new project form when there
// is none yet, otherwise it asks.
export const pipelineDashboardCard: DashboardCard = {
  id: 'pipeline',
  title: 'Pipeline',
  category: 'Orchestration',
  description: 'Design and monitor robust data pipelines and workflows.',
  icon: PipelineCardIcon,
  // Between Object Explorer (600) and ETL (800)
  order: 700,
  onSelect: ({ navigate, openSidebar, hasProjects }) => {
    if (!hasProjects) {
      goToProjectList(navigate, openSidebar, true);
      return;
    }
    pipelineRunStore.openProjectChoice();
  },
};

// "Where should the pipeline go?", shown on Home after the card is clicked.
export const PipelineProjectChoiceDialog: React.FC = () => {
  const navigate = useNavigate();
  const { setIsSidebarOpen } = useAppContext();
  const { isProjectChoiceOpen } = usePipelineRunState();

  const choose = (startNewProject: boolean) => {
    pipelineRunStore.closeProjectChoice();
    goToProjectList(navigate, () => setIsSidebarOpen(true), startNewProject);
  };

  return (
    <Dialog
      open={isProjectChoiceOpen}
      onClose={pipelineRunStore.closeProjectChoice}
      maxWidth="xs"
      fullWidth
    >
      <DialogTitle>Where should the pipeline go?</DialogTitle>
      <DialogContent>
        <List disablePadding>
          <ListItemButton
            onClick={() => choose(true)}
            sx={{ borderRadius: 1.5, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <AddIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="New project"
              secondary="Create a new project, then add a pipeline to it"
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </ListItemButton>
          <ListItemButton
            onClick={() => choose(false)}
            sx={{ borderRadius: 1.5 }}
          >
            <ListItemIcon sx={{ minWidth: 36 }}>
              <FolderOpenIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Existing project"
              secondary="Pick one of your projects to add a pipeline to"
              primaryTypographyProps={{ fontWeight: 600 }}
            />
          </ListItemButton>
        </List>
      </DialogContent>
      <DialogActions>
        <Button onClick={pipelineRunStore.closeProjectChoice}>Cancel</Button>
      </DialogActions>
    </Dialog>
  );
};
