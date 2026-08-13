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
  Switch,
  FormControlLabel,
  RadioGroup,
  Radio,
  FormLabel,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import { Close, FolderOpen, Save } from '@mui/icons-material';
import DatabaseIcon from '@mui/icons-material/Storage';

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

type DatalakeInstance = {
  id: string;
  name: string;
  dataPath: string;
  storage?: {
    type: 'local' | 's3' | 'azure' | 'gcs';
  };
  status: string;
};

type NewProjectProps = {
  defaultProjectPath: string;
  setDefaultProjectPath: (path: string) => void;
  newProject: { name: string; createTemplateFolders: boolean };
  setNewProject: (p: { name: string; createTemplateFolders: boolean }) => void;
  selectedConnection: string;
  setSelectedConnection: (id: string) => void;
  connectionType: 'standard' | 'datalake';
  setConnectionType: (type: 'standard' | 'datalake') => void;
  isLoadingConnections: boolean;
  connections: Connection[];
  datalakeInstances: DatalakeInstance[];
  isLoadingDatalakes: boolean;
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
  connectionType,
  setConnectionType,
  isLoadingConnections,
  connections,
  datalakeInstances,
  isLoadingDatalakes,
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
          <Typography variant="h5" component="h5" color="primary">
            Setup New Project
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
              data-testid="project-create-confirm-btn"
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
            value={`${defaultProjectPath}${navigator.appVersion.indexOf('Win') === -1 ? '/' : '\\'}${newProject.name}`}
            onChange={(event) => setDefaultProjectPath(event.target.value)}
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
                          if (data.length > 0) {
                            setDefaultProjectPath(data[0]);
                          } else {
                            setDefaultProjectPath(defaultProjectPath);
                          }
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
          <FormControlLabel
            control={
              <Switch
                defaultChecked
                onChange={(event) =>
                  setNewProject({
                    ...newProject,
                    createTemplateFolders: event.target.checked,
                  })
                }
              />
            }
            label="Create template dbt directories"
            labelPlacement="start"
            value={newProject.createTemplateFolders}
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
            inputProps={{ 'data-testid': 'project-name-input' }}
          />

          <FormControl component="fieldset" sx={{ mb: 2 }}>
            <FormLabel component="legend">Connection Type</FormLabel>
            <RadioGroup
              row
              value={connectionType}
              onChange={(e) => {
                setConnectionType(e.target.value as 'standard' | 'datalake');
                setSelectedConnection(''); // Reset selection when switching
              }}
            >
              <FormControlLabel
                value="standard"
                control={<Radio />}
                label="Standard Connection"
              />
              <FormControlLabel
                value="datalake"
                control={<Radio />}
                label="Datalake Connection"
              />
            </RadioGroup>
          </FormControl>

          {connectionType === 'standard' ? (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="connection-select-label">
                Connection (Optional)
              </InputLabel>
              <Select
                labelId="connection-select-label"
                value={selectedConnection}
                label="Connection (Optional)"
                onChange={(e) => setSelectedConnection(e.target.value)}
                disabled={isLoadingConnections}
              >
                <MenuItem value="">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      color: 'text.secondary',
                    }}
                  >
                    <DatabaseIcon sx={{ fontSize: 20, marginRight: 1 }} />
                    <Typography>No connection (add later)</Typography>
                  </Box>
                </MenuItem>
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
                {connections
                  .filter(
                    (connection) => connection.connection.type !== 'sqlite',
                  )
                  .map((connection) => (
                    <MenuItem key={connection.id} value={connection.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <ConnectionIconContainer>
                          {renderConnectionIcon(connection.connection.type)}
                        </ConnectionIconContainer>
                        {connection.connection.name} -{' '}
                        {connection.connection.type}
                      </Box>
                    </MenuItem>
                  ))}
              </Select>
            </FormControl>
          ) : (
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="datalake-select-label">
                Datalake Connection (Optional)
              </InputLabel>
              <Select
                labelId="datalake-select-label"
                value={selectedConnection}
                label="Datalake Connection (Optional)"
                onChange={(e) => setSelectedConnection(e.target.value)}
                disabled={isLoadingDatalakes}
              >
                <MenuItem value="">
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      width: '100%',
                      color: 'text.secondary',
                    }}
                  >
                    <DatabaseIcon sx={{ fontSize: 20, marginRight: 1 }} />
                    <Typography>No datalake (add later)</Typography>
                  </Box>
                </MenuItem>
                {datalakeInstances.map((datalake) => {
                  const isSupported =
                    datalake.storage?.type === 's3' ||
                    datalake.storage?.type === 'local';
                  const isDisabled = !isSupported;

                  return (
                    <MenuItem
                      key={datalake.id}
                      value={datalake.id}
                      disabled={isDisabled}
                      title={
                        // eslint-disable-next-line no-nested-ternary
                        isDisabled && datalake.storage?.type
                          ? `${datalake.storage.type.toUpperCase()} storage is not supported for DBT projects`
                          : isDisabled
                            ? 'Storage type not supported for DBT projects'
                            : ''
                      }
                    >
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          opacity: isDisabled ? 0.5 : 1,
                        }}
                      >
                        <ConnectionIconContainer>
                          <DatabaseIcon sx={{ fontSize: 20 }} />
                        </ConnectionIconContainer>
                        {datalake.name} - {datalake.storage?.type || 'unknown'}
                        {isDisabled && (
                          <Typography
                            variant="caption"
                            sx={{ ml: 1, color: 'text.secondary' }}
                          >
                            (Not supported)
                          </Typography>
                        )}
                      </Box>
                    </MenuItem>
                  );
                })}
              </Select>
            </FormControl>
          )}
        </Box>
      </AddProjectForm>
    </Box>
  );
};
