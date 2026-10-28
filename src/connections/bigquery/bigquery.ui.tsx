import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { BigQueryConnection } from '../../types/backend';
import { BigQuery } from './BigQueryForm';

export const bigqueryUi: ConnectionUi<BigQueryConnection> = {
  type: 'bigquery',
  icon: connectionIcons.images.bigquery,
  accentColor: '#4285f4',
  Form: BigQuery,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    projectId: conn.project,
    keyFilename: conn.keyfile,
    schema: conn.database,
    method: conn.method,
    keyfile: conn.keyfile,
    location: conn.location,
    priority: conn.priority,
  }),
  listDetails: (conn) =>
    `Project: ${conn.project || (conn as unknown as { projectId?: string }).projectId}`,
  envFields: ['project', 'dataset'],
};
