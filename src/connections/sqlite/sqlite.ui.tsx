import connectionIcons from '../../../assets/connectionIcons';
import type { ConnectionUi } from '../core/ui.renderer';
import type { SQLiteConnection } from '../../types/backend';
import { SQLite } from './SQLiteForm';

export const sqliteUi: ConnectionUi<SQLiteConnection> = {
  type: 'sqlite',
  icon: connectionIcons.images.sqlite,
  Form: SQLite,
  sqlEditorInput: (conn) => ({
    type: conn.type,
    database_path: conn.database_path,
    database: conn.database_path,
    schema: 'main',
    name: conn.name,
  }),
  listDetails: (conn) =>
    `Path: ${conn.short_database_path || conn.database_path}`,
};
