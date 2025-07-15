import React from 'react';
import { useGetConnections } from '../../controllers';
import { Loader } from '../../components';

const Connections: React.FC = () => {
  const { data: connections = [], isLoading } = useGetConnections();

  if (isLoading) {
    return <Loader />;
  }

  return (
    <div>
      {connections.map(({ id, connection }) => (
        <div key={id}>{connection.name}</div>
      ))}
    </div>
  );
};

export default Connections;
