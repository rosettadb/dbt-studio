import { useGetConnections } from '../controllers';
import {
  sqlDialectForConnection,
  type SqlDialect,
} from '../utils/sql/schemaObjectSql';

/**
 * Dialect key for schema-object SQL (quoting, LIMIT style), resolved from the
 * connection id and type callers already have. The type decides it for every
 * connection except Spanner, whose dialect is read from the cached connection.
 */
export function useSqlDialect(
  connectionId: string | undefined,
  connectionType: SqlDialect,
): SqlDialect {
  const { data: connections = [] } = useGetConnections();
  const connection = connections.find(
    (item) => item.id === connectionId,
  )?.connection;
  return sqlDialectForConnection(
    connectionType,
    connection?.type === 'spanner' ? connection.dialect : undefined,
  );
}
