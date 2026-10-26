import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { RedshiftConnection } from '../../types/backend';
import { Redshift } from './RedshiftForm';

export const redshiftUi: ConnectionUi<RedshiftConnection> = {
  type: 'redshift',
  icon: connectionIcons.images.redshift,
  accentColor: '#8c4fff',
  Form: Redshift,
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
