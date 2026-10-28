import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { DuckDBConnection } from '../../types/backend';
import { DuckDB } from './DuckDBForm';

export const duckdbUi: ConnectionUi<DuckDBConnection> = {
  type: 'duckdb',
  icon: connectionIcons.images.duckdb,
  accentColor: '#fff000',
  Form: DuckDB,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    database_path: conn.database_path,
    database: conn.database,
    schema: conn.schema || 'main',
    name: conn.name,
  }),
  listDetails: (conn) =>
    `Path: ${conn.short_database_path || conn.database_path}`,
};
