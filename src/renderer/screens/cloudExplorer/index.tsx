import React from 'react';
import { Container, Typography, Box, IconButton } from '@mui/material';
import { Close } from '@mui/icons-material';
import { useNavigate, useLocation } from 'react-router-dom';
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
  const navigate = useNavigate();

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

  const handleClose = () => {
    navigate('/app');
  };

  const getSectionTitle = (section: string) => {
    switch (section) {
      case 'dashboard':
        return 'Dashboard';
      case 'connections':
        return 'Connections';
      case 'recent-items':
        return 'Recent Items';
      case 'new-connection':
        return 'New Connection';
      case 'edit-connection':
        return 'Edit Connection';
      case 'buckets':
        return 'Buckets';
      case 'bucket-content':
        return 'Bucket Content';
      default:
        return 'Cloud Explorer';
    }
  };

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
        return <ExplorerEditConnection />;
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
      <Container>
        <Box sx={{ mb: 2 }}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 2,
            }}
          >
            <Typography variant="h4" sx={{ m: 0 }}>
              {getSectionTitle(currentSection)}
            </Typography>
            <IconButton onClick={handleClose} edge="end" aria-label="close">
              <Close />
            </IconButton>
          </Box>
          <Box sx={{ maxWidth: '800px' }}>{renderContent()}</Box>
        </Box>
      </Container>
    </AppLayout>
  );
};

export default CloudExplorer;
