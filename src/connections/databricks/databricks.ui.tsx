import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { DatabricksConnection } from '../../types/backend';
import { Databricks } from './DatabricksForm';

export const databricksUi: ConnectionUi<DatabricksConnection> = {
  type: 'databricks',
  icon: connectionIcons.images.databricks,
  accentColor: '#ff3621',
  Form: Databricks,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    host: conn.host,
    port: conn.port,
    httpPath: conn.httpPath,
    token: conn.token, // Use token directly
    database: conn.database,
    schema: conn.schema,
  }),
  listDetails: (conn) => `Host: ${conn.host}`,
  envFields: ['host', 'httppath', 'catalog', 'schema'],
};
