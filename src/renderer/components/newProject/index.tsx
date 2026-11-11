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
  FormControlLabel,
  RadioGroup,
  Radio,
  FormLabel,
  Step,
  StepLabel,
  Stepper,
  Checkbox,
  FormGroup,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import {
  ArrowBack,
  ArrowForward,
  Check,
  Close,
  FolderOpen,
} from '@mui/icons-material';
import DatabaseIcon from '@mui/icons-material/Storage';

import { styled } from '@mui/material/styles';
import { path } from '../../lib/path';
import {
  defaultTemplateItems,
  getProjectTypeDefinition,
  listProjectTypes,
  type ProjectType,
} from '../../../projectTypes/registry.shared';
import { getProjectTypeUi } from '../../../projectTypes/registry.renderer';

const AddProjectForm = styled(Box)(({ theme }) => ({
  width: '100%',
  maxWidth: 560,
  margin: '0 auto',
  padding: theme.spacing(2, 4, 3, 4),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  alignItems: 'stretch',
}));

const ConnectionIconContainer = styled(Box)`
  display: flex;
  align-items: center;
  margin-right: 8px;
`;

const TypeCard = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'selected',
})<{ selected: boolean }>(({ theme, selected }) => ({
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  padding: theme.spacing(2),
  borderRadius: 8,
  border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
  backgroundColor: selected
    ? theme.palette.action.selected
    : theme.palette.background.paper,
  cursor: 'pointer',
  '&:hover': { borderColor: theme.palette.primary.main },
}));

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

const STEPS = ['Type', 'Details', 'Include'];

type NewProjectProps = {
  defaultProjectPath: string;
  setDefaultProjectPath: (path: string) => void;
  newProject: { name: string; createTemplateFolders: boolean };
  setNewProject: (p: { name: string; createTemplateFolders: boolean }) => void;
  projectType: ProjectType;
  setProjectType: (type: ProjectType) => void;
  include: string[];
  setInclude: (include: string[]) => void;
  validateName: (name: string) => { isValid: boolean; message?: string };
  selectedConnection: string;
  setSelectedConnection: (id: string) => void;
  connectionType: 'standard' | 'datalake';
  setConnectionType: (type: 'standard' | 'datalake') => void;
  isLoadingConnections: boolean;
  /** Every saved connection; the wizard filters them by project type. */
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

/**
 * New Project wizard (plan 95): pick the project type, fill in the details,
 * then choose which template items to create. Types, their connection
 * filter and their items come from the project-type registry.
 */
export const NewProject: React.FC<NewProjectProps> = ({
  defaultProjectPath,
  setDefaultProjectPath,
  newProject,
  setNewProject,
  projectType,
  setProjectType,
  include,
  setInclude,
  validateName,
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
  const [activeStep, setActiveStep] = React.useState(0);
  const [nameError, setNameError] = React.useState<string>();
  const definition = getProjectTypeDefinition(projectType);
  const offersDatalake = definition.capabilities.datalakeConnections;
  const projectConnections = connections.filter((connection) =>
    definition.acceptsConnection(connection.connection.type),
  );

  const selectType = (type: ProjectType) => {
    if (type === projectType) return;
    setProjectType(type);
    setInclude(defaultTemplateItems(type));
    setSelectedConnection('');
    setConnectionType('standard');
  };

  const toggleItem = (id: string, checked: boolean) => {
    const next = checked
      ? [...include, id]
      : include.filter((itemId) => itemId !== id);
    // Drop items whose prerequisite was just unchecked
    setInclude(
      next.filter((itemId) => {
        const item = definition.templateItems.find((i) => i.id === itemId);
        return !item?.requires || next.includes(item.requires);
      }),
    );
  };

  const handleNext = () => {
    if (activeStep === 1) {
      const validation = validateName(newProject.name);
      if (!validation.isValid) {
        setNameError(validation.message);
        return;
      }
    }
    setNameError(undefined);
    setActiveStep((step) => step + 1);
  };

  const isLastStep = activeStep === STEPS.length - 1;

  const renderTypeStep = () => (
    <Box sx={{ display: 'flex', gap: 2 }} data-testid="project-type-step">
      {listProjectTypes().map((type) => {
        const { Icon } = getProjectTypeUi(type.id);
        return (
          <TypeCard
            key={type.id}
            selected={type.id === projectType}
            onClick={() => selectType(type.id)}
            role="radio"
            aria-checked={type.id === projectType}
            data-testid={`project-type-${type.id}`}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Icon size={22} />
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>
                {type.title}
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 12.5, color: 'text.secondary' }}>
              {type.description}
            </Typography>
          </TypeCard>
        );
      })}
    </Box>
  );

  const renderDetailsStep = () => (
    <Box
      component="form"
      sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}
      onSubmit={(e) => {
        e.preventDefault();
        handleNext();
      }}
    >
      <TextField
        fullWidth
        disabled
        label="Project Path"
        variant="outlined"
        id="rosettaPath"
        name="rosettaPath"
        value={path.join(defaultProjectPath, newProject.name)}
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
      <TextField
        fullWidth
        label="Project Name"
        variant="outlined"
        value={newProject.name}
        onChange={(e) => {
          setNameError(undefined);
          setNewProject({ ...newProject, name: e.target.value });
        }}
        error={!!nameError}
        helperText={nameError}
        autoFocus
        inputProps={{ 'data-testid': 'project-name-input' }}
      />

      {offersDatalake && (
        <FormControl component="fieldset">
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
      )}

      {connectionType === 'standard' || !offersDatalake ? (
        <FormControl fullWidth>
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
                sx={{ display: 'flex', alignItems: 'center', width: '100%' }}
              >
                <AddIcon sx={{ fontSize: 20, marginRight: 1 }} />
                <Typography>New Connection</Typography>
              </Box>
            </MenuItem>
            {projectConnections.map((connection) => (
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
      ) : (
        <FormControl fullWidth>
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
  );

  const renderIncludeStep = () => (
    <Box data-testid="project-include-step">
      <Typography sx={{ fontSize: 12.5, color: 'text.secondary', mb: 1 }}>
        What Studio creates in {path.join(defaultProjectPath, newProject.name)}
      </Typography>
      <FormGroup>
        {definition.templateItems.map((item) => {
          const blocked = !!item.requires && !include.includes(item.requires);
          return (
            <FormControlLabel
              key={item.id}
              disabled={blocked}
              control={
                <Checkbox
                  checked={include.includes(item.id)}
                  onChange={(e) => toggleItem(item.id, e.target.checked)}
                  inputProps={
                    {
                      'data-testid': `project-include-${item.id}`,
                    } as React.InputHTMLAttributes<HTMLInputElement>
                  }
                />
              }
              label={
                <Box>
                  <Typography sx={{ fontSize: 13 }}>{item.label}</Typography>
                  <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                    {item.description}
                  </Typography>
                </Box>
              }
              sx={{
                alignItems: 'flex-start',
                py: 0.5,
                '& .MuiCheckbox-root': { pt: 0.5 },
              }}
            />
          );
        })}
      </FormGroup>
    </Box>
  );

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
      <Box sx={{ width: '100%', maxWidth: '800px', mb: 1 }}>
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
            New {definition.title}
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
            {activeStep > 0 && (
              <Button
                variant="outlined"
                startIcon={<ArrowBack />}
                onClick={() => setActiveStep((step) => step - 1)}
                size="medium"
              >
                Back
              </Button>
            )}
            {isLastStep ? (
              <Button
                variant="contained"
                color="primary"
                startIcon={<Check />}
                onClick={handleAddProject}
                size="medium"
                data-testid="project-create-confirm-btn"
              >
                Create
              </Button>
            ) : (
              <Button
                variant="contained"
                color="primary"
                startIcon={<ArrowForward />}
                onClick={handleNext}
                size="medium"
                data-testid="project-wizard-next-btn"
              >
                Next
              </Button>
            )}
          </Box>
        </Box>
        <Divider sx={{ my: 2 }} />
        <Stepper activeStep={activeStep} sx={{ maxWidth: 560, mx: 'auto' }}>
          {STEPS.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>
      </Box>
      <AddProjectForm>
        {activeStep === 0 && renderTypeStep()}
        {activeStep === 1 && renderDetailsStep()}
        {activeStep === 2 && renderIncludeStep()}
      </AddProjectForm>
    </Box>
  );
};
