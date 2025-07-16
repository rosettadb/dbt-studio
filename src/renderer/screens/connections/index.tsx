import React from 'react';
import { useGetConnections } from '../../controllers';
import { Loader } from '../../components';
import { AppLayout } from '../../layouts';

const Connections: React.FC = () => {
  const { data: connections = [], isLoading } = useGetConnections();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <AppLayout>
      {connections.map(({ id, connection }) => (
        <div key={id}>{connection.name}</div>
      ))}
    </AppLayout>
  );
};

export default Connections;
