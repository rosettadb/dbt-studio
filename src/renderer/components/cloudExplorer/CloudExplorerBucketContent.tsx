import React from 'react';
import { useParams } from 'react-router-dom';
import { ExplorerBucketContent } from './ExplorerBucketContent';

export const CloudExplorerBucketContent: React.FC = () => {
  const { connectionId, bucketName } = useParams<{
    connectionId: string;
    bucketName: string;
  }>();

  if (!connectionId || !bucketName) {
    return <div>Connection ID or bucket name not found</div>;
  }

  return (
    <ExplorerBucketContent
      connectionId={connectionId}
      bucketName={bucketName}
    />
  );
};
