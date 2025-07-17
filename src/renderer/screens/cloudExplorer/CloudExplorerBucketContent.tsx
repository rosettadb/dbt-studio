import React from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '../../layouts';
import {
  ExplorerSidebar,
  ExplorerBucketContent,
} from '../../components/cloudExplorer';

const CloudExplorerBucketContent: React.FC = () => {
  const { connectionId, bucketName } = useParams<{
    connectionId: string;
    bucketName: string;
  }>();

  if (!connectionId || !bucketName) {
    return <div>Connection ID or bucket name not found</div>;
  }

  return (
    <AppLayout sidebarContent={<ExplorerSidebar />}>
      <ExplorerBucketContent
        connectionId={connectionId}
        bucketName={bucketName}
      />
    </AppLayout>
  );
};

export default CloudExplorerBucketContent;
