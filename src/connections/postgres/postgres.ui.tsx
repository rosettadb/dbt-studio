import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { PostgresConnection } from '../../types/backend';
import { Postgres } from './PostgresForm';

export const postgresUi: ConnectionUi<PostgresConnection> = {
  type: 'postgres',
  icon: connectionIcons.images.postgres,
  accentColor: '#336791',
  Form: Postgres,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    database: conn.database,
    schema: conn.schema || 'public',
  }),
  listDetails: (conn) => `Host: ${conn.host}:${conn.port}`,
  envFields: ['host', 'port', 'dbname', 'schema'],
};
