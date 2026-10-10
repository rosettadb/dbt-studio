import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  TextField,
  Box,
  InputAdornment,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Tooltip,
  Chip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import PlaylistRemoveIcon from '@mui/icons-material/PlaylistRemove';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import DatabaseIcon from '@mui/icons-material/Storage';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { toast } from 'react-toastify';
import { Cable } from '@mui/icons-material';
import {
  useDeleteProject,
  useRemoveProjectFromList,
  useGetConnections,
  useGetProjects,
  useSelectProject,
  useUpdateProject,
} from '../../controllers';
import { AddConnectionModal, CloneRepoModal, Icon, GetStartedModal } from '..';
import { icons } from '../../../../assets';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  Project,
  SupportedConnectionTypes,
  canUseAsDbtConnection,
} from '../../../types/backend';
import {
  EmptyStateContainer,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
  HeaderContainer,
  ProjectActions,
  ProjectCard,
  ProjectCardContent,
  ProjectIcon,
  ProjectInfo,
  ProjectMuiIcon,
  ProjectPath,
  ProjectsContainer,
  ProjectSelectionContainer,
  ProjectTitle,
  SearchContainer,
  TaglineContainer,
  TaglineText,
} from './styles';
import { useProjectImport } from '../../hooks/useProjectImport';

const ProjectsList: React.FC = () => {
  const navigate = useNavigate();
  const { mutateAsync: selectProject } = useSelectProject();
  const { importProject } = useProjectImport();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [] } = useGetConnections();
  const [isCloneModalOpen, setIsCloneModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [menuAnchorEl, setMenuAnchorEl] = React.useState<HTMLElement | null>(
    null,
  );
  const [activeProjectId, setActiveProjectId] = React.useState<
    number | string | null
  >(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [projectToDelete, setProjectToDelete] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [removeFromListDialogOpen, setRemoveFromListDialogOpen] =
    React.useState(false);
  const [projectToRemoveFromList, setProjectToRemoveFromList] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isGetStartedModalOpen, setIsGetStartedModalOpen] =
    React.useState(false);
  const [isAddConnectionModalOpen, setIsAddConnectionModalOpen] =
    React.useState(false);
  const [selectedProjectForConnection, setSelectedProjectForConnection] =
    React.useState<Project | null>(null);

  const { mutate: deleteProject } = useDeleteProject({
    onSuccess: () => {
      toast.info(`Project ${projectToDelete?.name} successfully deleted!`);
    },
  });

  const { mutate: removeProjectFromList } = useRemoveProjectFromList({
    onSuccess: () => {
      toast.info(
        `Project ${projectToRemoveFromList?.name} removed from Studio.`,
      );
    },
  });

  const { mutate: updateProject } = useUpdateProject();

  const getConnectionIcon = (project: Project) => {
    const connType = project?.connection?.type;

    if (!connType) {
      return null;
    }

    return connectionIcons.images[connType as SupportedConnectionTypes];
  };

  const renderProjectIcon = (project: Project) => {
    const connectionIcon = getConnectionIcon(project);

    if (connectionIcon) {
      return (
        <ProjectIcon
          src={connectionIcon}
          alt={project?.dbtConnection?.type || 'database'}
        />
      );
    }
    return (
      <ProjectMuiIcon>
        <DatabaseIcon />
      </ProjectMuiIcon>
    );
  };

  const handleOpenMenu = (
    event: React.MouseEvent<HTMLElement>,
    projectId: string,
  ) => {
    event.stopPropagation();
    setMenuAnchorEl(event.currentTarget);
    setActiveProjectId(projectId);
  };

  const handleCloseMenu = () => {
    setMenuAnchorEl(null);
    setActiveProjectId(null);
  };

  const handleDeleteProject = () => {
    const projectToRemove = projects.find((p) => p.id === activeProjectId);
    if (projectToRemove) {
      setProjectToDelete({
        id: projectToRemove.id,
        name: projectToRemove.name,
      });
      setDeleteDialogOpen(true);
    }
    handleCloseMenu();
  };

  const confirmDeleteProject = async () => {
    if (projectToDelete) {
      deleteProject({ id: projectToDelete.id });
    }
    setDeleteDialogOpen(false);
    setProjectToDelete(null);
  };

  const handleRemoveProjectFromList = () => {
    const project = projects.find((p) => p.id === activeProjectId);
    if (project) {
      setProjectToRemoveFromList({ id: project.id, name: project.name });
      setRemoveFromListDialogOpen(true);
    }
    handleCloseMenu();
  };

  const confirmRemoveProjectFromList = async () => {
    if (projectToRemoveFromList) {
      removeProjectFromList({ id: projectToRemoveFromList.id });
    }
    setRemoveFromListDialogOpen(false);
    setProjectToRemoveFromList(null);
  };

  const handleGetStarted = () => {
    setIsGetStartedModalOpen(true);
  };

  const handleAddConnection = (project: Project) => {
    setSelectedProjectForConnection(project);
    setIsAddConnectionModalOpen(true);
  };

  const handleConnectionModalClose = () => {
    setIsAddConnectionModalOpen(false);
    setSelectedProjectForConnection(null);
  };

  const handleRemoveConnection = (project: Project) => {
    updateProject({
      ...project,
      connectionId: undefined,
    });
    toast.success(
      `Connection removed from project ${project.name} successfully!`,
    );
  };

  const filteredProjects = projects.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const renderConditionalContent = () => {
    if (projects.length === 0) {
      return (
        <EmptyStateContainer>
          <EmptyStateIcon>
            <HelpOutlineIcon /> {/* Changed icon here */}
          </EmptyStateIcon>
          <EmptyStateTitle variant="h5">No Projects found</EmptyStateTitle>
          <EmptyStateDescription variant="body1">
            You don&apos;t have any projects yet.
          </EmptyStateDescription>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
            }}
          >
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => navigate('/app/projects/new')}
              sx={{ height: 40 }}
            >
              New Project
            </Button>
            <Button
              variant="outlined"
              color="primary"
              startIcon={<RocketLaunchIcon />}
              onClick={handleGetStarted}
              sx={{ height: 40 }}
            >
              Get Started
            </Button>
          </Box>
        </EmptyStateContainer>
      );
    }
    if (filteredProjects.length === 0) {
      return (
        <EmptyStateContainer>
          <EmptyStateIcon>
            <SearchOffIcon />
          </EmptyStateIcon>
          <EmptyStateTitle variant="h5">No Matching Projects</EmptyStateTitle>
          <EmptyStateDescription variant="body1">
            No projects match your search query.
          </EmptyStateDescription>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => navigate('/app/projects/new')}
            sx={{ height: 40 }}
          >
            New Project
          </Button>
        </EmptyStateContainer>
      );
    }
    return (
      <ProjectsContainer data-testid="project-list">
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            data-testid={`project-card-${project.name}`}
            data-project-name={project.name}
            onClick={async () => {
              await selectProject({ projectId: project.id });
              navigate('/app/dbt-project');
            }}
          >
            <ProjectCardContent>
              {renderProjectIcon(project)}
              <ProjectInfo>
                <ProjectTitle variant="body1">{project.name}</ProjectTitle>
                <ProjectPath>{project.path || 'No path specified'}</ProjectPath>
              </ProjectInfo>
            </ProjectCardContent>
            <ProjectActions>
              {/* Only show badge if connection name exists */}
              {project.connection?.name && (
                <Chip
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Cable sx={{ fontSize: 12, mr: 0.5 }} />
                      {project.connection.name}
                    </Box>
                  }
                  size="small"
                  sx={{
                    mr: 1,
                    fontWeight: 500,
                    fontSize: 12,
                    textTransform: 'none',
                    bgcolor: 'background.paper',
                    color: 'primary.main',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                  title="Connection Name"
                />
              )}
              {!project.connection?.name && (
                <Chip
                  label={
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <DatabaseIcon sx={{ fontSize: 12, mr: 0.5 }} />
                      No connection
                    </Box>
                  }
                  size="small"
                  sx={{
                    mr: 1,
                    fontWeight: 500,
                    fontSize: 12,
                    textTransform: 'none',
                    bgcolor: 'background.paper',
                    color: 'text.disabled',
                    border: '1px solid',
                    borderColor: 'divider',
                    cursor: 'pointer',
                    '&:hover': {
                      bgcolor: 'action.hover',
                    },
                  }}
                  title="Click to add database connection"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddConnection(project);
                  }}
                />
              )}
              <IconButton
                size="small"
                onClick={(e) => handleOpenMenu(e, project.id)}
                data-testid={`project-options-${project.name}`}
              >
                <MoreVertIcon />
              </IconButton>
            </ProjectActions>
          </ProjectCard>
        ))}

        <Menu
          anchorEl={menuAnchorEl}
          open={Boolean(menuAnchorEl)}
          onClose={handleCloseMenu}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'right',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'right',
          }}
        >
          {!projects.find((p) => p.id === activeProjectId)?.connection
            ?.name && (
            <MenuItem
              onClick={() => {
                const project = projects.find((p) => p.id === activeProjectId);
                if (project) {
                  handleAddConnection(project);
                }
                handleCloseMenu();
              }}
            >
              <ListItemIcon>
                <Cable fontSize="small" color="primary" />
              </ListItemIcon>
              <ListItemText>Add Connection</ListItemText>
            </MenuItem>
          )}
          {projects.find((p) => p.id === activeProjectId)?.connection?.name && (
            <MenuItem
              onClick={() => {
                const project = projects.find((p) => p.id === activeProjectId);
                if (project) {
                  handleRemoveConnection(project);
                }
                handleCloseMenu();
              }}
            >
              <ListItemIcon>
                <Cable fontSize="small" color="error" />
              </ListItemIcon>
              <ListItemText>Remove Connection</ListItemText>
            </MenuItem>
          )}
          <MenuItem
            onClick={handleRemoveProjectFromList}
            data-testid="context-menu-remove-from-list"
          >
            <ListItemIcon>
              <PlaylistRemoveIcon fontSize="small" color="warning" />
            </ListItemIcon>
            <ListItemText>Remove from List</ListItemText>
          </MenuItem>
          <MenuItem
            onClick={handleDeleteProject}
            data-testid="context-menu-delete"
          >
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </ProjectsContainer>
    );
  };

  return (
    <ProjectSelectionContainer data-testid="project-selection">
      <>
        <TaglineContainer>
          {/* <TaglineLogo src={logo} alt="RosettaDB Logo" /> */}
          <TaglineText>Manage your projects</TaglineText>
        </TaglineContainer>

        <HeaderContainer>
          <SearchContainer>
            <TextField
              fullWidth
              placeholder="Search Projects"
              variant="outlined"
              size="small"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              inputProps={{ 'data-testid': 'project-search-input' }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon color="action" />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </SearchContainer>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {!projects.some((p) => p.name === 'dbtstudio_getting_started') && (
              <Tooltip title="Import getting started example project">
                <Button
                  variant="outlined"
                  color="primary"
                  onClick={handleGetStarted}
                  sx={{ height: 40 }}
                >
                  <RocketLaunchIcon sx={{ marginRight: 1 }} fontSize="small" />
                  Get Started
                </Button>
              </Tooltip>
            )}
            <Tooltip title="Clone from git repository...">
              <Button
                variant="contained"
                color="primary"
                onClick={() => setIsCloneModalOpen(true)}
              >
                <Icon
                  src={icons.git}
                  width={20}
                  height={20}
                  style={{ marginRight: 4 }}
                />
                Clone
              </Button>
            </Tooltip>
            <Tooltip title="Import project from folder or compressed file...">
              <Button
                variant="contained"
                color="primary"
                data-testid="import-project-btn"
                onClick={importProject}
              >
                <DriveFolderUploadIcon
                  sx={{ marginRight: 1 }}
                  fontSize="small"
                />
                Import
              </Button>
            </Tooltip>
            <Tooltip title="Create a new project">
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={() => navigate('/app/projects/new')}
                sx={{ height: 40 }}
                data-testid="create-project-btn"
              >
                New
              </Button>
            </Tooltip>
          </Box>
        </HeaderContainer>

        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {renderConditionalContent()}
        </Box>
      </>

      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">Delete Project</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Are you sure you want to delete the project &quot;
            {projectToDelete?.name}
            &quot;? This action cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)} color="primary">
            Cancel
          </Button>
          <Button
            onClick={confirmDeleteProject}
            color="error"
            variant="contained"
            autoFocus
            data-testid="confirm-delete-btn"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={removeFromListDialogOpen}
        onClose={() => setRemoveFromListDialogOpen(false)}
        aria-labelledby="remove-from-list-dialog-title"
        aria-describedby="remove-from-list-dialog-description"
      >
        <DialogTitle id="remove-from-list-dialog-title">
          Remove Project from List
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="remove-from-list-dialog-description">
            Are you sure you want to remove &quot;
            {projectToRemoveFromList?.name}
            &quot; from Studio? The project folder on disk will not be deleted,
            and you can re-add it later.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => setRemoveFromListDialogOpen(false)}
            color="primary"
          >
            Cancel
          </Button>
          <Button
            onClick={confirmRemoveProjectFromList}
            color="warning"
            variant="contained"
            autoFocus
            data-testid="confirm-remove-from-list-btn"
          >
            Remove
          </Button>
        </DialogActions>
      </Dialog>
      <GetStartedModal
        isOpen={isGetStartedModalOpen}
        onClose={() => setIsGetStartedModalOpen(false)}
      />
      {isCloneModalOpen && (
        <CloneRepoModal
          isOpen={isCloneModalOpen}
          onClose={() => setIsCloneModalOpen(false)}
        />
      )}
      <AddConnectionModal
        isOpen={isAddConnectionModalOpen}
        onClose={handleConnectionModalClose}
        project={selectedProjectForConnection}
        connections={connections.filter((connection) =>
          canUseAsDbtConnection(connection.connection.type),
        )}
        onSuccess={() => {
          // Projects will be automatically refreshed via React Query
        }}
        onUpdateProject={updateProject}
      />
    </ProjectSelectionContainer>
  );
};

export default ProjectsList;
