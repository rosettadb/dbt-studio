import React from 'react';
import {
  Typography,
  Box,
  TextField,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  Divider,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Close, FolderOpen, Save } from '@mui/icons-material';

import { styled } from '@mui/material/styles';

const AddProjectForm = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: 500,
  margin: '0 auto',
  padding: theme.spacing(4, 4, 3, 4),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  alignItems: 'stretch',
}));

// const FormActions = styled(Box)`
//   display: flex;
//   justify-content: flex-end;
//   gap: 1rem;
//   margin-top: 1.5rem;
// `;

const ConnectionIconContainer = styled(Box)`
  display: flex;
  align-items: center;
  margin-right: 8px;
`;

type Connection = {
  id: string;
  connection: {
    type: string;
    name: string;
  };
};

type NewProjectProps = {
  defaultProjectPath: string;
  setDefaultProjectPath: (path: string) => void;
  newProject: { name: string };
  setNewProject: (p: { name: string }) => void;
  selectedConnection: string;
  setSelectedConnection: (id: string) => void;
  isLoadingConnections: boolean;
  connections: Connection[];
  navigate: (to: string) => void;
  getFiles: (
    options: any,
    callbacks: { onSuccess: (data: string[]) => void },
  ) => void;
  handleAddProject: () => void;
  setIsAddingProject: (b: boolean) => void;
  renderConnectionIcon: (type: string) => React.ReactNode;
};

export const NewProject: React.FC<NewProjectProps> = ({
  defaultProjectPath,
  setDefaultProjectPath,
  newProject,
  setNewProject,
  selectedConnection,
  setSelectedConnection,
  isLoadingConnections,
  connections,
  navigate,
  getFiles,
  handleAddProject,
  setIsAddingProject,
  renderConnectionIcon,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        p: 3,
      }}
    >
      <Box sx={{ textAlign: 'center', mb: 2 }}>
        <Typography
          variant="subtitle1"
          color="primary"
          fontWeight={500}
          sx={{ mb: 5 }}
        >
          Turn Raw Data into Business Insights—Faster with RosettaDB
        </Typography>
      </Box>
      <Box
        sx={{
          width: '100%',
          maxWidth: '800px', // Changed from 800px to 500px
          mb: 3,
        }}
      >
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            width: '100%',
            mb: 2,
          }}
        >
          <Typography variant="h4" component="h4" color="primary">
            New Project
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              startIcon={<Close />}
              onClick={() => setIsAddingProject(false)}
              size="medium"
            >
              Cancel
            </Button>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Save />}
              onClick={handleAddProject}
              size="medium"
            >
              Save
            </Button>
          </Box>
        </Box>
        <Divider sx={{ my: 2 }} />
      </Box>
      <AddProjectForm>
        <Box
          component="form"
          sx={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          <TextField
            fullWidth
            disabled
            label="Project Path"
            variant="outlined"
            id="rosettaPath"
            name="rosettaPath"
            value={`${defaultProjectPath}/${newProject.name}`}
            onChange={(event) => setDefaultProjectPath(event.target.value)}
            sx={{ mb: 2, background: '#f7f8fa' }}
            InputProps={{
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
          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel id="connection-select-label">Connection</InputLabel>
            <Select
              labelId="connection-select-label"
              value={selectedConnection}
              label="Connection"
              onChange={(e) => setSelectedConnection(e.target.value)}
              disabled={isLoadingConnections}
            >
              <MenuItem onClick={() => navigate('/app/add-connection')}>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    width: '100%',
                  }}
                >
                  <AddIcon sx={{ fontSize: 20, marginRight: 1 }} />
                  <Typography>New Connection</Typography>
                </Box>
              </MenuItem>
              {connections.map((connection) => (
                <MenuItem key={connection.id} value={connection.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <ConnectionIconContainer>
                      {renderConnectionIcon(connection.connection.type)}
                    </ConnectionIconContainer>
                    {connection.connection.name} - {connection.connection.type}
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </AddProjectForm>
    </Box>
  );
};
