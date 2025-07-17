import React from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  ExplorerSidebar,
  ExplorerBuckets,
} from '../../components/cloudExplorer';

const CloudExplorerBuckets: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();

  if (!connectionId) {
    return <div>Connection ID not found</div>;
  }

  return (
    <AppLayout sidebarContent={<ExplorerSidebar />}>
      <ExplorerBuckets connectionId={connectionId} />
    </AppLayout>
  );
};

export default CloudExplorerBuckets;
