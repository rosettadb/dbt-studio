import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Typography,
  Box,
  styled,
  IconButton,
  Tooltip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button,
  Chip,
} from '@mui/material';
import DatabaseIcon from '@mui/icons-material/Storage';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import { toast } from 'react-toastify';
import {
  useDeleteConnection,
  useGetConnections,
  useGetProjects,
} from '../../controllers';
import { Loader } from '../../components';
import { AppLayout } from '../../layouts';
import connectionIcons from '../../../../assets/connectionIcons';
import { SupportedConnectionTypes } from '../../../types/backend';

const ConnectionsContainer = styled(Box)`
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

const ConnectionsListContainer = styled(Box)`
  display: flex;
  flex-direction: column;
  gap: 1px;
  border-top: 1px solid ${({ theme }) => theme.palette.divider};
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};
  flex: 1;
  overflow-y: auto;
  min-height: 0; /* Critical for Firefox */
`;

const ConnectionCard = styled(Box)`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid ${({ theme }) => theme.palette.divider};

  &:last-child {
    border-bottom: none;
  }
`;

const ConnectionInfo = styled(Box)`
  flex-grow: 1;
  overflow: hidden;
`;

const ConnectionTitle = styled(Typography)`
  font-weight: 500;
  margin-bottom: 4px;
`;

const ConnectionType = styled(Typography)`
  font-size: 12px;
  color: ${({ theme }) => theme.palette.text.secondary};
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
`;

const ProjectsUsing = styled(Box)`
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
`;

const ConnectionIcon = styled('img')`
  width: 24px;
  height: 24px;
  margin-right: 12px;
  flex-shrink: 0;
  border-radius: 4px;
  object-fit: contain;
`;

const ConnectionMuiIcon = styled(Box)`
  width: 24px;
  height: 24px;
  margin-right: 12px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const ConnectionCardContent = styled(Box)`
  display: flex;
  align-items: center;
  flex-grow: 1;
  overflow: hidden;
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
  gap: 0.25rem;
`;

const TaglineText = styled(Typography)`
  font-size: 1rem;
  font-weight: 500;
  color: ${({ theme }) => theme.palette.primary.main};
`;

const ConnectionActions = styled(Box)`
  display: flex;
  align-items: center;
  gap: 8px;
`;

const EmptyStateContainer = styled(Box)`
  text-align: center;
  padding: 2rem;
  margin-top: 2rem;
  border-radius: 8px;
  border: 0.5px solid ${({ theme }) => theme.palette.divider};
  overflow-y: auto;
  flex: 1;
`;

const EmptyStateIcon = styled(Box)`
  margin-bottom: 1rem;
  color: ${({ theme }) => theme.palette.text.secondary};
  opacity: 0.7;

  svg {
    font-size: 3rem;
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

const Connections: React.FC = () => {
  const { data: connections = [], isLoading } = useGetConnections();
  const navigate = useNavigate();
  const { data: projects = [] } = useGetProjects();

  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [connectionToDelete, setConnectionToDelete] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const { mutate: deleteConnection } = useDeleteConnection({
    onSuccess: () => {
      toast.info(
        `Connection ${connectionToDelete?.name} successfully deleted!`,
      );
    },
  });

  // Helper function to get projects using a connection
  const getProjectsUsingConnection = (connectionId: string) => {
    return projects.filter((project) => project.connectionId === connectionId);
  };

  // Helper function to check if connection can be deleted
  const canDeleteConnection = (connectionId: string) => {
    return getProjectsUsingConnection(connectionId).length === 0;
  };

  const handleDeleteConnection = (id: string) => {
    const connectionToRemove = connections.find((c) => c.id === id);
    if (connectionToRemove) {
      setConnectionToDelete({
        id: connectionToRemove.id,
        name: connectionToRemove.connection.name,
      });
      setDeleteDialogOpen(true);
    }
  };

  const confirmDeleteConnection = async () => {
    if (connectionToDelete) {
      deleteConnection(connectionToDelete.id);
    }
    setDeleteDialogOpen(false);
    setConnectionToDelete(null);
  };

  // Helper function to get connection icon
  const getConnectionIcon = (connectionType: string) => {
    return connectionIcons.images[connectionType as SupportedConnectionTypes];
  };

  // Helper function to render the appropriate icon component
  const renderConnectionIcon = (connectionType: string) => {
    const connectionIcon = getConnectionIcon(connectionType);

    if (connectionIcon) {
      // Render image icon for supported connection types
      return <ConnectionIcon src={connectionIcon} alt={connectionType} />;
    }
    // Render MUI icon for unsupported connection types
    return (
      <ConnectionMuiIcon>
        <DatabaseIcon />
      </ConnectionMuiIcon>
    );
  };

  if (isLoading) {
    return <Loader />;
  }

  return (
    <AppLayout>
      <ConnectionsContainer>
        <TaglineContainer>
          <TaglineText variant="h6">Manage Your Data Connections</TaglineText>
        </TaglineContainer>

        <HeaderContainer>
          <Typography variant="h4" component="h1">
            Connections
          </Typography>
        </HeaderContainer>

        {connections.length === 0 ? (
          <EmptyStateContainer>
            <EmptyStateIcon>
              <DatabaseIcon />
            </EmptyStateIcon>
            <EmptyStateTitle variant="h5">No Connections found</EmptyStateTitle>
            <EmptyStateDescription variant="body1">
              You don&#39;t have any connections configured yet.
            </EmptyStateDescription>
          </EmptyStateContainer>
        ) : (
          <ConnectionsListContainer>
            {connections.map(({ id, connection }) => {
              const projectsUsing = getProjectsUsingConnection(id);
              return (
                <ConnectionCard key={id}>
                  <ConnectionCardContent>
                    {renderConnectionIcon(connection.type)}
                    <ConnectionInfo>
                      <ConnectionTitle variant="body1">
                        {connection.name}
                      </ConnectionTitle>
                      <ConnectionType>{connection.type}</ConnectionType>
                      {projectsUsing.length > 0 && (
                        <ProjectsUsing>
                          {projectsUsing.map((project) => (
                            <Chip
                              key={project.id}
                              label={project.name}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '10px', height: '20px' }}
                            />
                          ))}
                        </ProjectsUsing>
                      )}
                    </ConnectionInfo>
                  </ConnectionCardContent>
                  <ConnectionActions>
                    <Tooltip title="Edit connection">
                      <IconButton
                        size="small"
                        onClick={() => {
                          navigate(`/app/edit-connection/${id}`);
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip
                      title={
                        canDeleteConnection(id) ? 'Delete' : 'Connection in use'
                      }
                    >
                      <IconButton
                        onClick={() => {
                          if (canDeleteConnection(id)) {
                            handleDeleteConnection(id);
                            return;
                          }
                          toast.error(
                            'Cannot delete! Connection already used!',
                          );
                        }}
                      >
                        <DeleteIcon fontSize="small" color="error" />
                      </IconButton>
                    </Tooltip>
                  </ConnectionActions>
                </ConnectionCard>
              );
            })}
          </ConnectionsListContainer>
        )}

        <Dialog
          open={deleteDialogOpen}
          onClose={() => setDeleteDialogOpen(false)}
          aria-labelledby="alert-dialog-title"
          aria-describedby="alert-dialog-description"
        >
          <DialogTitle id="alert-dialog-title">Delete Connection</DialogTitle>
          <DialogContent>
            <DialogContentText id="alert-dialog-description">
              Are you sure you want to delete the connection &quot;
              {connectionToDelete?.name}
              &quot;? This action cannot be undone.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialogOpen(false)} color="primary">
              Cancel
            </Button>
            <Button
              onClick={confirmDeleteConnection}
              color="error"
              variant="contained"
              autoFocus
            >
              Delete
            </Button>
          </DialogActions>
        </Dialog>
      </ConnectionsContainer>
    </AppLayout>
  );
};

export default Connections;
