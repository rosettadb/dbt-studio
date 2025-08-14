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
import SearchOffIcon from '@mui/icons-material/SearchOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import DatabaseIcon from '@mui/icons-material/Storage';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import { toast } from 'react-toastify';
import { Cable } from '@mui/icons-material';
import { projectsServices } from '../../services';
import {
  useDeleteProject,
  useFilePicker,
  useGetConnections,
  useGetProjects,
  useGetSettings,
  useSelectProject,
  useUpdateProject,
} from '../../controllers';
import {
  AddConnectionModal,
  CloneRepoModal,
  Icon,
  GetStartedModal,
  NewProject,
} from '../../components';
import { icons } from '../../../../assets';
import connectionIcons from '../../../../assets/connectionIcons';
import { AppLayout } from '../../layouts';
import { Project, SupportedConnectionTypes } from '../../../types/backend';
import {
  ConnectionIcon,
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

const SelectProject: React.FC = () => {
  const navigate = useNavigate();
  const { mutateAsync: selectProject } = useSelectProject();
  const { data: settings } = useGetSettings();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [], isLoading: isLoadingConnections } =
    useGetConnections();
  const [selectedConnection, setSelectedConnection] =
    React.useState<string>('');
  const [isCloneModalOpen, setIsCloneModalOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [isAddingProject, setIsAddingProject] = React.useState(false);
  const [newProject, setNewProject] = React.useState({
    name: '',
  });
  const { mutate: getFiles } = useFilePicker();

  const [defaultProjectPath, setDefaultProjectPath] = React.useState<string>(
    settings?.projectsDirectory ?? '',
  );
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

  const { mutate: updateProject } = useUpdateProject();

  const getConnectionIcon = (project: Project) => {
    const connectionType = project?.connection?.type;

    if (!connectionType) {
      return null;
    }

    return connectionIcons.images[connectionType as SupportedConnectionTypes];
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

  // Helper function to render connection icon for the selector
  const renderConnectionIcon = (connectionType: string) => {
    const iconSrc =
      connectionIcons.images[connectionType as SupportedConnectionTypes];
    if (iconSrc) {
      return <ConnectionIcon src={iconSrc} alt={connectionType} />;
    }
    return <DatabaseIcon sx={{ fontSize: 20, marginRight: 0.75 }} />;
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

  const validateProjectName = (
    name: string,
  ): { isValid: boolean; message?: string } => {
    if (!name.trim()) {
      return { isValid: false, message: 'Project name cannot be empty' };
    }

    if (name.length < 3) {
      return {
        isValid: false,
        message: 'Project name must be at least 3 characters',
      };
    }

    if (!/^[a-zA-Z]\w*$/.test(name)) {
      return {
        isValid: false,
        message:
          'Project name must start with a letter and only contain letters, numbers, and underscores (no spaces, hyphens or special characters)',
      };
    }

    const projectExists = projects.some(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );

    if (projectExists) {
      return {
        isValid: false,
        message: 'A project with this name already exists',
      };
    }

    return { isValid: true };
  };

  const handleAddProject = async () => {
    const validation = validateProjectName(newProject.name);

    if (!validation.isValid) {
      toast.error(validation.message);
      return;
    }

    try {
      const project = await projectsServices.addProject({
        name: `${defaultProjectPath}/${newProject.name}`,
        connectionId: selectedConnection || undefined,
      });
      await projectsServices.selectProject({ projectId: project.id });
      toast.success(`Project ${project.name} created successfully!`);
      setIsAddingProject(false);
      setNewProject({ name: '' });
      setSelectedConnection('');
      navigate('/app/loading');
    } catch (error) {
      toast.error('Failed to create project. Please try again.');
    }
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
              onClick={() => setIsAddingProject(true)}
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
            onClick={() => setIsAddingProject(true)}
            sx={{ height: 40 }}
          >
            New Project
          </Button>
        </EmptyStateContainer>
      );
    }
    return (
      <ProjectsContainer>
        {filteredProjects.map((project) => (
          <ProjectCard
            key={project.id}
            onClick={async () => {
              await projectsServices.selectProject({
                projectId: project.id,
              });
              navigate('/app/loading');
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
          <MenuItem onClick={handleDeleteProject}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" color="error" />
            </ListItemIcon>
            <ListItemText>Delete</ListItemText>
          </MenuItem>
        </Menu>
      </ProjectsContainer>
    );
  };

  React.useEffect(() => {
    setDefaultProjectPath(settings?.projectsDirectory ?? '');
  }, [settings?.projectsDirectory]);

  return (
    <AppLayout>
      <ProjectSelectionContainer>
        {isAddingProject ? (
          <NewProject
            defaultProjectPath={defaultProjectPath}
            setDefaultProjectPath={setDefaultProjectPath}
            newProject={newProject}
            setNewProject={setNewProject}
            selectedConnection={selectedConnection}
            setSelectedConnection={setSelectedConnection}
            isLoadingConnections={isLoadingConnections}
            connections={connections}
            navigate={navigate}
            getFiles={getFiles}
            handleAddProject={handleAddProject}
            setIsAddingProject={setIsAddingProject}
            renderConnectionIcon={renderConnectionIcon}
          />
        ) : (
          <>
            <TaglineContainer>
              {/* <TaglineLogo src={logo} alt="RosettaDB Logo" /> */}
              <TaglineText>Manage your dbt projects</TaglineText>
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
                {!projects.some(
                  (p) => p.name === 'dbtstudio_getting_started',
                ) && (
                  <Tooltip title="Import getting started example project">
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleGetStarted}
                      sx={{ height: 40 }}
                    >
                      <RocketLaunchIcon
                        sx={{ marginRight: 1 }}
                        fontSize="small"
                      />
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
                    onClick={async () => {
                      try {
                        const project =
                          await projectsServices.addProjectFromFolder();
                        if (project && project.id) {
                          await selectProject({
                            projectId: project.id,
                          });
                          setIsAddingProject(false);
                          setNewProject({ name: '' });

                          // Show different success messages based on whether it was extracted
                          if (project.isExtracted) {
                            toast.success(
                              `Project ${project.name} imported from compressed file successfully!`,
                            );
                          } else {
                            toast.success(
                              `Project ${project.name} loaded successfully!`,
                            );
                          }

                          navigate('/app/loading');
                        } else {
                          toast.error('Failed to import project.');
                        }
                      } catch (error: any) {
                        // Show more specific error messages
                        if (error.message.includes('compressed')) {
                          toast.error(
                            'Failed to extract compressed file. Please ensure it contains a valid dbt project.',
                          );
                        } else if (error.message.includes('validation')) {
                          toast.error(
                            'Invalid dbt project structure. Please ensure the folder contains a valid dbt_project.yml file.',
                          );
                        } else if (error.message.includes('already exists')) {
                          toast.error(error.message);
                        } else {
                          toast.error(
                            'Failed to import project. Please try again.',
                          );
                        }
                      }
                    }}
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
                    onClick={() => setIsAddingProject(true)}
                    sx={{ height: 40 }}
                  >
                    New
                  </Button>
                </Tooltip>
              </Box>
            </HeaderContainer>

            {renderConditionalContent()}
          </>
        )}

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
            >
              Delete
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
          connections={connections}
          onSuccess={() => {
            // Projects will be automatically refreshed via React Query
          }}
          onUpdateProject={updateProject}
        />
      </ProjectSelectionContainer>
    </AppLayout>
  );
};

export default SelectProject;
