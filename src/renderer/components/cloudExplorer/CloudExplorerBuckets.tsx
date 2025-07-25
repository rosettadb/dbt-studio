import React from 'react';
import { useParams } from 'react-router-dom';
import { ExplorerBuckets } from './ExplorerBuckets';

export const CloudExplorerBuckets: React.FC = () => {
  const { connectionId } = useParams<{ connectionId: string }>();

  if (!connectionId) {
    return <div>Connection ID not found</div>;
  }

  return <ExplorerBuckets connectionId={connectionId} />;
};
