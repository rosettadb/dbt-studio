import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  TextField,
  Typography,
  Box,
  styled,
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
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DriveFolderUploadIcon from '@mui/icons-material/DriveFolderUpload';
import { toast } from 'react-toastify';
import { FolderOpen } from '@mui/icons-material';
import { projectsServices } from '../../services';
import {
  useDeleteProject,
  useFilePicker,
  useGetProjects,
  useGetSettings,
} from '../../controllers';
import { CloneRepoModal, Icon } from '../../components';
import { icons, logo } from '../../../../assets';

const ProjectSelectionContainer = styled(Box)`
  padding: 0.5rem 2rem 2rem;
  max-width: 1200px;
  margin: 0 auto;
  height: 100%;
  display: flex;
  flex-direction: column;
`;

const HeaderContainer = styled(Box)`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
`;

const SearchContainer = styled(Box)`
  flex-grow: 1;
  max-width: 400px;
`;

const ProjectsContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* Critical for Firefox */
`;

const ProjectCard = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background-color: ${({ theme }) => theme.palette.action.hover};
  }
`;

const ProjectInfo = styled(Box)`
  flex-grow: 1;
  overflow: hidden;
`;

const ProjectTitle = styled(Typography)`
  font-weight: 500;
  margin-bottom: 4px;
`;

const ProjectPath = styled(Typography)`
  font-size: 12px;
  color: ${({ theme }) => theme.palette.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
`;

const ProjectActions = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const AddProjectForm = styled(Box)`
  width: 100%;
  max-width: 600px;
  margin: 2rem auto;
  padding: 2rem;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.palette.divider};
`;

const FormActions = styled(Box)`
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  margin-top: 1.5rem;
`;

const EmptyStateContainer = styled(Box)`
  text-align: center;
  padding: 2rem;
  margin-top: 2rem;
  border-radius: 8px;
  border: 0.5px solid ${({ theme }) => theme.palette.divider};
  overflow-y: auto; /* Make this scrollable too if content is too large */
  flex: 1;
`;

const EmptyStateIcon = styled(Box)`
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.palette.text.secondary};
  opacity: 0.7;

  svg {
    font-size: 3rem;
    /* Animation removed */
  }
`;

const EmptyStateTitle = styled(Typography)`
  font-weight: 500;
  margin-bottom: 1rem;
  font-size: 1.5rem;
  color: ${({ theme }) => theme.palette.text.primary};
`;

const EmptyStateDescription = styled(Typography)`
  color: ${({ theme }) => theme.palette.text.secondary};
  margin: 0 auto 2rem;
  line-height: 1.6;
`;

const TaglineContainer = styled(Box)`
  text-align: center;
  margin-bottom: 1.5rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem; /* Reduced gap from 0.75rem to 0.25rem */
`;

const TaglineText = styled(Typography)`
  font-size: 1rem;
  font-weight: 500;
  color: ${({ theme }) => theme.palette.primary.main};
`;

const TaglineLogo = styled('img')`
  height: 40px;
  width: auto;
`;

const SelectProject: React.FC = () => {
  const navigate = useNavigate();
  const { data: settings } = useGetSettings();
  const { data: projects = [] } = useGetProjects();
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

  const { mutate: deleteProject } = useDeleteProject({
    onSuccess: () => {
      toast.info(`Project ${projectToDelete?.name} successfully deleted!`);
    },
  });

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

  // Add function to perform the actual deletion
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

    // Check if project name follows DBT naming pattern
    if (!/^[a-zA-Z]\w*$/.test(name)) {
      return {
        isValid: false,
        message:
          'Project name must start with a letter and only contain letters, numbers, and underscores (no spaces, hyphens or special characters)',
      };
    }

    // Check if project name already exists
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
      });
      await projectsServices.selectProject({ projectId: project.id });
      navigate('/app');
      toast.success(`Project ${project.name} created successfully!`);
      setIsAddingProject(false);
      setNewProject({ name: '' });
    } catch (error) {
      toast.error('Failed to create project. Please try again.');
    }
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
              // Instead of reloading the window, navigate to the project details page
              navigate('/app');
            }}
          >
            <ProjectInfo>
              <ProjectTitle variant="body1">{project.name}</ProjectTitle>
              <ProjectPath>{project.path || 'No path specified'}</ProjectPath>
            </ProjectInfo>
            <ProjectActions>
              <IconButton
                size="small"
                onClick={(e) => handleOpenMenu(e, project.id)}
              >
                <MoreVertIcon />
              </IconButton>
            </ProjectActions>
          </ProjectCard>
        ))}

        {/* Menu for project actions */}
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
    <ProjectSelectionContainer>
      {isAddingProject ? (
        <>
          <Typography variant="h4" component="h2" gutterBottom align="center">
            Create New Project
          </Typography>
          <AddProjectForm>
            <TextField
              fullWidth
              disabled
              label="Project Path"
              variant="outlined"
              id="rosettaPath"
              name="rosettaPath"
              value={`${defaultProjectPath}/${newProject.name}`}
              onChange={(event) => setDefaultProjectPath(event.target.value)}
              sx={{ mb: 2 }}
              slotProps={{
                input: {
                  endAdornment: (
                    <IconButton
                      onClick={() => {
                        getFiles(
                          {
                            properties: ['openDirectory'],
                            defaultPath: defaultProjectPath,
                          },
                          {
                            onSuccess: (data) => {
                              setDefaultProjectPath(data[0]);
                            },
                          },
                        );
                      }}
                      edge="end"
                    >
                      <FolderOpen />
                    </IconButton>
                  ),
                },
              }}
            />
            <TextField
              fullWidth
              label="Project Name"
              variant="outlined"
              value={newProject.name}
              onChange={(e) =>
                setNewProject({ ...newProject, name: e.target.value })
              }
              autoFocus
              sx={{ mb: 2 }}
            />
            <FormActions>
              <Button
                variant="outlined"
                onClick={() => setIsAddingProject(false)}
              >
                Cancel
              </Button>
              <Button
                variant="contained"
                color="primary"
                onClick={handleAddProject}
                disabled={!newProject.name.trim()}
              >
                Create Project
              </Button>
            </FormActions>
          </AddProjectForm>
        </>
      ) : (
        <>
          <TaglineContainer>
            <TaglineLogo src={logo} alt="RosettaDB Logo" />
            <TaglineText variant="h6">
              Turn Raw Data into Business Insights—Faster with RosettaDB
            </TaglineText>
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
              <Tooltip title="Load files from folder...">
                <Button
                  variant="contained"
                  color="primary"
                  onClick={async () => {
                    try {
                      const project =
                        await projectsServices.addProjectFromFolder();
                      if (project && project.id) {
                        await projectsServices.selectProject({
                          projectId: project.id,
                        });
                        setIsAddingProject(false);
                        setNewProject({ name: '' });
                      }
                    } catch (error) {
                      // Show toast message instead of throwing an error
                    }
                  }}
                >
                  <DriveFolderUploadIcon
                    sx={{ marginRight: 1 }}
                    fontSize="small"
                  />
                  Load
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
      {isCloneModalOpen && (
        <CloneRepoModal
          isOpen={isCloneModalOpen}
          onClose={() => setIsCloneModalOpen(false)}
        />
      )}
    </ProjectSelectionContainer>
  );
};

export default SelectProject;
