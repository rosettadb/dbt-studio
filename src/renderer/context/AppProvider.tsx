import React from 'react';
import { useLocation } from 'react-router-dom';
import { Box, Typography, Button } from '@mui/material';
import { AppContextType } from '../../types/frontend';
import { Splash } from '../components';
import { useGetProjects, useGetSelectedProject } from '../controllers';
import { Project, Table } from '../../types/backend';
import { projectsServices } from '../services';
import { client } from '../config/client';
import { logo } from '../../../assets';

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

  const location = useLocation();
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

  if (!selectedProject && !location.pathname.includes('select-project')) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: 'calc(100vh - 48px)',
          textAlign: 'center',
          padding: 3,
          bgcolor: (theme) => theme.palette.background.default,
        }}
      >
        <img
          src={logo}
          alt="RosettaDB Logo"
          style={{ width: 180, marginBottom: 24 }}
        />
        <Typography variant="h5" gutterBottom color="text.primary">
          No Project Selected
        </Typography>
        <Typography
          variant="body1"
          color="text.secondary"
          sx={{ maxWidth: 500, mb: 4 }}
        >
          You need to select or create a project to get started with Rosetta dbt
          Studio.
        </Typography>
        <Button
          variant="contained"
          size="medium"
          sx={(theme) => ({
            bgcolor: theme.palette.primary.main,
            color: theme.palette.primary.contrastText,
            '&:hover': {
              bgcolor: theme.palette.primary.dark,
            },
            px: 3,
            py: 1,
          })}
          onClick={() => client.get('windows:openSelector')}
        >
          Select or Create Project
        </Button>
      </Box>
    );
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export { AppProvider };
