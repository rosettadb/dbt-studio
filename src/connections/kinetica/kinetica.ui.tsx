import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { KineticaConnection } from '../../types/backend';
import { Kinetica } from './KineticaForm';
import { buildKineticaUrl } from './kinetica.url.shared';

export const kineticaUi: ConnectionUi<KineticaConnection> = {
  type: 'kinetica',
  icon: connectionIcons.images.kinetica,
  Form: Kinetica,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username,
    password: conn.password,
    database: conn.database || '',
    schema: conn.schema || '',
  }),
  envFields: ['host', 'port', 'url', 'dbname', 'schema'],
  // dbt-kinetica takes the full head-node URL as `host`
  envFieldValue: (conn, field) =>
    field === 'url' && conn.host ? buildKineticaUrl(conn) : undefined,
};
