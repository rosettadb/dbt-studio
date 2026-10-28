import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { MySqlConnection } from '../../types/backend';
import { MySql } from './MySqlForm';

export const mysqlUi: ConnectionUi<MySqlConnection> = {
  type: 'mysql',
  icon: connectionIcons.images.mysql,
  accentColor: '#00758f',
  Form: MySql,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    database: conn.database || '',
    schema: conn.schema || '',
    ssl: conn.ssl,
  }),
  envFields: ['host', 'port', 'dbname', 'schema'],
};
