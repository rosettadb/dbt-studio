import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { SnowflakeConnection } from '../../types/backend';
import { Snowflake } from './SnowflakeForm';

export const snowflakeUi: ConnectionUi<SnowflakeConnection> = {
  type: 'snowflake',
  icon: connectionIcons.images.snowflake,
  accentColor: '#29b5e8',
  Form: Snowflake,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    account: conn.account,
    username: conn.username,
    password: conn.password,
    database: conn.database,
    warehouse: conn.warehouse,
    schema: conn.schema || 'PUBLIC',
    role: conn.role,
  }),
  listDetails: (conn) => `Account: ${conn.account}`,
  envFields: ['account', 'warehouse', 'dbname', 'schema', 'role'],
  browserAuth: { isEnabled: (conn) => conn.authMethod === 'oauth_browser' },
};
