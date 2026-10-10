import React from 'react';
import { Box, Typography } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  ProjectsSidebar,
  ProjectsDashboard,
  ProjectsList,
  ProjectsNew,
  ProjectsRecent,
} from '../../components/projects';

const Projects: React.FC = () => {
  const location = useLocation();
  const currentSection =
    location.pathname.split('/').filter(Boolean).pop() || 'dashboard';

  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return <ProjectsDashboard />;
      case 'list':
        return <ProjectsList />;
      case 'recent':
        return <ProjectsRecent />;
      case 'new':
        return <ProjectsNew />;
      default:
        return <Typography>Select a section</Typography>;
    }
  };

  return (
    <AppLayout sidebarContent={<ProjectsSidebar />} panelTitle="Projects">
      <Box sx={{ p: 2, height: '100%' }}>{renderContent()}</Box>
    </AppLayout>
  );
};

export default Projects;
