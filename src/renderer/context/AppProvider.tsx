import React from 'react';
import { AppContextType } from '../../types/frontend';
import { Splash } from '../components';
import { useGetProjects, useGetSelectedProject } from '../controllers';
import { Project, Table } from '../../types/backend';
import { projectsServices } from '../services';

type Props = {
  children: React.ReactNode;
};

export const AppContext = React.createContext<AppContextType>({
  projects: [],
  selectedProject: {} as Project,
  isSidebarOpen: true,
  setIsSidebarOpen: () => {},
  sidebarContent: <div />,
  setSidebarContent: () => {},
  fetchSchema: async () => {},
  schema: [],
});

const AppProvider: React.FC<Props> = ({ children }) => {
  const { data: projects = [] } = useGetProjects();
  const { data: selectedProject, isLoading } = useGetSelectedProject();

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isLoadingSchema, setIsLoadingSchema] = React.useState(false);
  const [schema, setSchema] = React.useState<Table[]>();
  const [sidebarContent, setSidebarContent] = React.useState<React.ReactNode>(
    <div />,
  );

  const fetchSchema = async () => {
    if (selectedProject) {
      setIsLoadingSchema(true);
      try {
        const schemaRes = await projectsServices.extractSchema(selectedProject);
        setSchema(schemaRes);
      } catch (_) {
        /* empty */
      } finally {
        setIsLoadingSchema(false);
      }
    }
  };

  React.useEffect(() => {
    fetchSchema();
  }, [selectedProject]);

  const value: AppContextType = React.useMemo(() => {
    return {
      projects: projects.sort(
        (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
      ),
      selectedProject: selectedProject!,
      sidebarContent,
      setSidebarContent,
      schema,
      fetchSchema,
      isSidebarOpen,
      setIsSidebarOpen,
      isLoadingSchema,
    };
  }, [projects, sidebarContent, schema, isLoadingSchema, isSidebarOpen]);

  if (isLoading) {
    return <Splash loaderMessage="Loading project..." />;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export { AppProvider };
