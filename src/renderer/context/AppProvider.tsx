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
  const [lastFetchedProjectId, setLastFetchedProjectId] = React.useState<
    string | null
  >(null);

  // Determine if AI provider is set based on active provider
  const isAiProviderSet = !!activeAIProvider;

  const fetchSchema = React.useCallback(
    async (forceRefresh = false) => {
      if (selectedProject) {
        // Skip fetch if we already have schema for this project and it's not a forced refresh
        if (
          !forceRefresh &&
          lastFetchedProjectId === selectedProject.id &&
          schema &&
          schema.length > 0
        ) {
          return;
        }

        setIsLoadingSchema(true);
        try {
          // Only clear schema on forced refresh to avoid flickering
          if (forceRefresh) {
            setSchema([]);
          }

          const schemaRes =
            await projectsServices.extractSchema(selectedProject);
          setSchema(schemaRes);
          setLastFetchedProjectId(selectedProject.id);
        } catch (error) {
          // Clear schema on error to ensure no stale data is shown
          setSchema([]);
          setLastFetchedProjectId(null);
          // eslint-disable-next-line no-console
          console.error('Failed to fetch schema:', error);
        } finally {
          setIsLoadingSchema(false);
        }
      } else {
        // Clear schema when no project is selected
        setSchema([]);
        setLastFetchedProjectId(null);
      }
    },
    [selectedProject, lastFetchedProjectId, schema],
  );

  React.useEffect(() => {
    // Only fetch if we don't have schema for the current project
    if (
      selectedProject &&
      (!schema || lastFetchedProjectId !== selectedProject.id)
    ) {
      fetchSchema();
    }
  }, [selectedProject?.id, fetchSchema]);

  // Memoize the fetchSchema function that forces refresh for manual calls
  const manualFetchSchema = React.useCallback(
    () => fetchSchema(true),
    [fetchSchema],
  );

  const value: AppContextType = React.useMemo(() => {
    return {
      projects: projects.sort(
        (a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0),
      ),
      selectedProject: selectedProject!,
      sidebarContent,
      setSidebarContent,
      schema,
      fetchSchema: manualFetchSchema,
      isSidebarOpen,
      setIsSidebarOpen,
      isLoadingSchema,
      isAiProviderSet,
      isChatOpen,
      setIsChatOpen,
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
    manualFetchSchema,
  ]);

  if (isLoading) {
    return <Splash loaderMessage="Loading project..." />;
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export { AppProvider };
