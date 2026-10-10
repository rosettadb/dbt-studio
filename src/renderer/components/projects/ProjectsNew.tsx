import React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import DatabaseIcon from '@mui/icons-material/Storage';
import { projectsServices, connectorsServices } from '../../services';
import {
  useFilePicker,
  useGetConnections,
  useGetProjects,
  useGetSettings,
  useSelectProject,
  useDuckLakeInstances,
} from '../../controllers';
import { NewProject } from '../newProject';
import connectionIcons from '../../../../assets/connectionIcons';
import {
  SupportedConnectionTypes,
  canUseAsDbtConnection,
} from '../../../types/backend';
import { pathJoin } from '../../services/settings.services';
import { ConnectionIcon, ProjectSelectionContainer } from './styles';

export const validateProjectName = (
  name: string,
  existingNames: string[],
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
  if (existingNames.some((n) => n.toLowerCase() === name.toLowerCase())) {
    return {
      isValid: false,
      message: 'A project with this name already exists',
    };
  }
  return { isValid: true };
};

const ProjectsNew: React.FC = () => {
  const navigate = useNavigate();
  const { mutateAsync: selectProject } = useSelectProject();
  const { data: settings } = useGetSettings();
  const { data: projects = [] } = useGetProjects();
  const { data: connections = [], isLoading: isLoadingConnections } =
    useGetConnections();
  const { data: datalakeInstances = [], isLoading: isLoadingDatalakes } =
    useDuckLakeInstances();
  const { mutate: getFiles } = useFilePicker();

  const [selectedConnection, setSelectedConnection] =
    React.useState<string>('');
  const [newProject, setNewProject] = React.useState({
    name: '',
    createTemplateFolders: true,
  });
  const [connectionType, setConnectionType] = React.useState<
    'standard' | 'datalake'
  >('standard');
  const [defaultProjectPath, setDefaultProjectPath] = React.useState<string>(
    settings?.projectsDirectory ?? '',
  );

  React.useEffect(() => {
    setDefaultProjectPath(settings?.projectsDirectory ?? '');
  }, [settings?.projectsDirectory]);

  const renderConnectionIcon = (connType: string) => {
    const iconSrc =
      connectionIcons.images[connType as SupportedConnectionTypes];
    if (iconSrc) {
      return <ConnectionIcon src={iconSrc} alt={connType} />;
    }
    return <DatabaseIcon sx={{ fontSize: 20, marginRight: 0.75 }} />;
  };

  const handleAddProject = async () => {
    const validation = validateProjectName(
      newProject.name,
      projects.map((p) => p.name),
    );
    if (!validation.isValid) {
      toast.error(validation.message);
      return;
    }

    try {
      const path = await pathJoin(defaultProjectPath, newProject.name);
      let connectionId = selectedConnection || undefined;

      if (connectionType === 'datalake' && selectedConnection) {
        const datalakeInstance = datalakeInstances.find(
          (dl) => dl.id === selectedConnection,
        );
        if (datalakeInstance) {
          const sanitizedName =
            `${datalakeInstance.name}_${newProject.name}`.replace(
              /[^a-zA-Z0-9_]/g,
              '_',
            );
          const datalakeConnection = {
            type: 'ducklake' as const,
            name: sanitizedName,
            host: '',
            port: 0,
            instanceId: datalakeInstance.id,
            dataPath: datalakeInstance.dataPath,
            status: datalakeInstance.status,
          };
          connectionId =
            await connectorsServices.saveConnection(datalakeConnection);
        } else {
          connectionId = undefined;
        }
      }

      const project = await projectsServices.addProject({
        name: path,
        connectionId,
        createTemplateFolders: newProject.createTemplateFolders,
      });
      await selectProject({ projectId: project.id });
      toast.success(`Project ${project.name} created successfully!`);
      navigate('/app/dbt-project');
    } catch (error) {
      toast.error(
        `Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  };

  return (
    <ProjectSelectionContainer data-testid="project-selection">
      <NewProject
        defaultProjectPath={defaultProjectPath}
        setDefaultProjectPath={setDefaultProjectPath}
        newProject={newProject}
        setNewProject={setNewProject}
        selectedConnection={selectedConnection}
        setSelectedConnection={setSelectedConnection}
        connectionType={connectionType}
        setConnectionType={setConnectionType}
        isLoadingConnections={isLoadingConnections}
        connections={connections.filter((connection) =>
          canUseAsDbtConnection(connection.connection.type),
        )}
        datalakeInstances={datalakeInstances}
        isLoadingDatalakes={isLoadingDatalakes}
        navigate={navigate}
        getFiles={getFiles}
        handleAddProject={handleAddProject}
        setIsAddingProject={(adding: boolean) => {
          if (!adding) navigate(-1);
        }}
        renderConnectionIcon={renderConnectionIcon}
      />
    </ProjectSelectionContainer>
  );
};

export default ProjectsNew;
