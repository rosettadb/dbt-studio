import React from 'react';
import { Typography, Box } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  ExplorerSidebar,
  ExplorerDashboard,
  ExplorerConnections,
  ExplorerRecentItems,
  ExplorerNewConnection,
  ExplorerEditConnection,
  CloudExplorerBuckets,
  CloudExplorerBucketContent,
} from '../../components/cloudExplorer';

const CloudExplorer: React.FC = () => {
  const location = useLocation();

  // Parse the current section from the pathname
  const pathSegments = location.pathname.split('/');
  const currentSection = (() => {
    if (pathSegments.includes('edit-connection')) {
      return 'edit-connection';
    }
    if (pathSegments.includes('buckets')) {
      return 'buckets';
    }
    if (pathSegments.includes('bucket') && pathSegments.length > 4) {
      return 'bucket-content';
    }
    return pathSegments.pop() || 'dashboard';
  })();

  // Render content based on current section
  const renderContent = () => {
    switch (currentSection) {
      case 'dashboard':
        return <ExplorerDashboard />;
      case 'connections':
        return <ExplorerConnections />;
      case 'recent-items':
        return <ExplorerRecentItems />;
      case 'new-connection':
        return <ExplorerNewConnection />;
      case 'edit-connection':
        return (
          <ExplorerEditConnection
            key={pathSegments[pathSegments.indexOf('edit-connection') + 1]}
          />
        );
      case 'buckets':
        return <CloudExplorerBuckets />;
      case 'bucket-content':
        return <CloudExplorerBucketContent />;
      default:
        return <Typography>Select a section</Typography>;
    }
  };

  return (
    <AppLayout sidebarContent={<ExplorerSidebar />}>
      <Box sx={{ p: 2 }}>
        <Box>{renderContent()}</Box>
      </Box>
    </AppLayout>
  );
};

export default CloudExplorer;
