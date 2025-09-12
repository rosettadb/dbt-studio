import React from 'react';
import { AppContextType } from '../../types/frontend';
import { Splash } from '../components';
import { useGetProjects, useGetSelectedProject } from '../controllers';
import { useGetActiveAIProvider } from '../controllers/aiProviders.controller';
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
  isAiProviderSet: false,
  isChatOpen: false,
  setIsChatOpen: () => {},
  pendingMessage: null,
  setPendingMessage: () => {},
  openChatWithMessage: () => {},
});

const AppProvider: React.FC<Props> = ({ children }) => {
  const { data: projects = [] } = useGetProjects();
  const { data: selectedProject, isLoading } = useGetSelectedProject();
  const { data: activeAIProvider } = useGetActiveAIProvider();

  const [isSidebarOpen, setIsSidebarOpen] = React.useState(true);
  const [isChatOpen, setIsChatOpen] = React.useState(false);
  const [isLoadingSchema, setIsLoadingSchema] = React.useState(false);
  const [schema, setSchema] = React.useState<Table[]>();
  const [sidebarContent, setSidebarContent] = React.useState<React.ReactNode>(
    <div />,
  );

  const [pendingMessage, setPendingMessage] = React.useState<string | null>(
    null,
  );

  const isAiProviderSet = !!activeAIProvider;

  const openChatWithMessage = React.useCallback((message: string) => {
    setPendingMessage(message);
    setIsChatOpen(true);
  }, []);

  const fetchSchema = async () => {
    if (selectedProject) {
      setIsLoadingSchema(true);
      try {
        // Clear schema first to avoid showing stale data
        setSchema([]);

        const schemaRes = await projectsServices.extractSchema(selectedProject);
        setSchema(schemaRes);
      } catch (error) {
        // Clear schema on error to ensure no stale data is shown
        setSchema([]);
        // eslint-disable-next-line no-console
        console.error('Failed to fetch schema:', error);
      } finally {
        setIsLoadingSchema(false);
      }
    } else {
      // Clear schema when no project is selected
      setSchema([]);
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
      isAiProviderSet,
      isChatOpen,
      setIsChatOpen,
      // Add new properties
      pendingMessage,
      setPendingMessage,
      openChatWithMessage,
    };
  }, [
    projects,
    sidebarContent,
    schema,
    isLoadingSchema,
    isSidebarOpen,
    selectedProject,
    isAiProviderSet,
    isChatOpen,
    pendingMessage,
    openChatWithMessage,
  ]);

  if (isLoading) {
    return <Splash loaderMessage="Loading project..." />;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export { AppProvider };
