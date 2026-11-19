import React from 'react';
import { Typography, Box } from '@mui/material';
import { Cable } from '@mui/icons-material';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import { PanelHeaderDropdown } from '../../components';
import { useGetCloudConnections } from '../../controllers/cloudExplorer.controller';
import { cloudStorageImages } from '../../../../assets/connectionIcons';
import { cloudExplorerSx } from '../../components/cloudExplorer/styles';
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
  const { data: sources = [] } = useGetCloudConnections();
  // The source the page is about: `connectionId` on the bucket routes,
  // `id` on the edit-connection route, unset on routes without a source
  const { connectionId, id: editedSourceId } = useParams<{
    connectionId?: string;
    id?: string;
  }>();
  const selectedSourceId = connectionId ?? editedSourceId;

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
    <AppLayout
      sidebarContent={<ExplorerSidebar />}
      panelHeaderLeft={
        <PanelHeaderDropdown
          data-testid="object-explorer-source-select"
          items={sources.map((source) => ({
            value: source.id,
            label: source.name,
            icon: cloudStorageImages[source.provider] ? (
              <img
                src={cloudStorageImages[source.provider]}
                alt=""
                style={{ width: 14, height: 14, objectFit: 'contain' }}
              />
            ) : (
              <Cable sx={{ fontSize: 14 }} />
            ),
          }))}
          value={selectedSourceId}
          onSelect={(id) => navigate(`/app/cloud-explorer/buckets/${id}`)}
          placeholder="Select Source"
          allLabel="All Sources"
          onAll={() => navigate('/app/cloud-explorer/connections')}
          addLabel="Add source"
          onAdd={() => navigate('/app/cloud-explorer/new-connection')}
        />
      }
    >
      <Box sx={cloudExplorerSx}>{renderContent()}</Box>
    </AppLayout>
  );
};

export default CloudExplorer;
