import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  styled,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import DatabaseIcon from '@mui/icons-material/Storage';
import CodeIcon from '@mui/icons-material/Code';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';
import { gitServices, projectsServices } from '../../services';

const StyledDialogContent = styled(DialogContent)`
  padding: 24px;
`;

const HeaderSection = styled(Box)`
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
`;

const FeaturesList = styled(List)`
  margin: 16px 0;
`;

const FeatureItem = styled(ListItem)`
  padding: 4px 0;
`;

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GetStartedModal: React.FC<GetStartedModalProps> = ({
  isOpen,
  onClose,
}) => {
  const navigate = useNavigate();
  const [isCreatingProject, setIsCreatingProject] = React.useState(false);

  const handleCreateProject = async () => {
    setIsCreatingProject(true);
    const url = 'https://github.com/rosettadb/dbtstudio_getting_started.git';

    try {
      const {
        error,
        authRequired,
        path,
        name,
        dbtConnection,
        rosettaConnection,
      } = await gitServices.gitClone(url);

      if (error) {
        toast.error(error);
        return;
      }

      if (authRequired) {
        toast.error('Authentication required!');
        return;
      }

      if (!path || !name) {
        toast.error('Something went wrong!');
        return;
      }

      const project = await projectsServices.addProjectFromVCS({
        path,
        name,
        dbtConnection,
        rosettaConnection,
      });

      await projectsServices.selectProject({ projectId: project.id });
      toast.success('Getting started project created successfully!');
      onClose();
      navigate('/app/edit-connection');
    } catch (error) {
      toast.error(
        'Failed to create getting started project. Please try again.',
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="get-started-dialog-title"
    >
      <DialogTitle id="get-started-dialog-title">
        <HeaderSection>
          <RocketLaunchIcon color="primary" />
          <Typography variant="h6" component="span">
            Get Started with RosettaDB
          </Typography>
        </HeaderSection>
      </DialogTitle>

      <StyledDialogContent>
        <Typography variant="body1">
          Import our example project to quickly explore RosettaDB&#39;s
          capabilities. This project demonstrates best practices and includes
          sample data to help you get started.
        </Typography>

        <Typography variant="h6" gutterBottom sx={{ mt: 2, mb: 1 }}>
          What&#39;s included:
        </Typography>

        <FeaturesList>
          <FeatureItem>
            <ListItemIcon>
              <DatabaseIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="DuckDB Database"
              secondary="Pre-configured with sample data for immediate experimentation"
            />
          </FeatureItem>

          <FeatureItem>
            <ListItemIcon>
              <CodeIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Sample DBT Models"
              secondary="Ready-to-run transformations showcasing common patterns"
            />
          </FeatureItem>

          <FeatureItem>
            <ListItemIcon>
              <TrendingUpIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Example Analytics"
              secondary="Pre-built dashboards and visualizations"
            />
          </FeatureItem>

          <FeatureItem>
            <ListItemIcon>
              <CheckCircleIcon color="primary" />
            </ListItemIcon>
            <ListItemText
              primary="Best Practices"
              secondary="Code examples following recommended patterns"
            />
          </FeatureItem>
        </FeaturesList>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          This will open the clone dialog with the getting started repository
          URL pre-filled.
        </Typography>
      </StyledDialogContent>

      <DialogActions sx={{ padding: '16px 24px' }}>
        <Button onClick={onClose} disabled={isCreatingProject}>
          Cancel
        </Button>
        <Button
          onClick={handleCreateProject}
          variant="contained"
          color="primary"
          disabled={isCreatingProject}
          startIcon={<RocketLaunchIcon />}
        >
          {isCreatingProject ? 'Creating...' : 'Create Example Project'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
