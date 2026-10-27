/* eslint-disable prefer-promise-reject-errors, consistent-return */
import { DBSQLClient } from '@databricks/sql';
import { DatabricksConnection, QueryResponseType } from '../../types/backend';

export async function testDatabricksConnection(
  config: DatabricksConnection,
): Promise<boolean> {
  const client = new DBSQLClient();

  try {
    const connection = await client.connect({
      token: config.token,
      host: config.host,
      path: config.httpPath,
    });

    const session = await connection.openSession();
    const queryOperation = await session.executeStatement(
      'SELECT 1 as connection_test',
      {
        runAsync: true,
      },
    );

    const result = await queryOperation.fetchAll();
    await queryOperation.close();
    await session.close();
    await client.close();

    return result.length > 0 && (result[0] as any)?.connection_test === 1;
  } catch (error) {
    return false;
  }
}

export const executeDatabricksQuery = async (
  config: DatabricksConnection,
  query: string,
  registerCancel?: (fn: () => void) => void,
): Promise<QueryResponseType> => {
  const client = new DBSQLClient();
  let session: any;
  let queryOperation: any;

  if (registerCancel) {
    registerCancel(async () => {
      try {
        if (queryOperation) await queryOperation.close();
        if (session) await session.close();
        await client.close();
      } catch (e) {
        // ignore errors during cancellation
      }
    });
  }

  try {
    const connection = await client.connect({
      token: config.token,
      host: config.host,
      path: config.httpPath,
    });

    session = await connection.openSession();
    queryOperation = await session.executeStatement(query, {
      runAsync: true,
    });

    const result = await queryOperation.fetchAll();
    // Read the operation schema before closing it: it is the only source of
    // column names when the result set is empty.
    const schema = await queryOperation.getSchema();
    await queryOperation.close();
    await session.close();
    await client.close();

    const schemaColumns: { columnName: string; position: number }[] =
      schema?.columns ?? [];

    let fields: { name: string; type: number }[] = [];
    if (schemaColumns.length > 0) {
      fields = [...schemaColumns]
        .sort((a, b) => a.position - b.position)
        .map((column, index) => ({ name: column.columnName, type: index }));
    } else if (result.length > 0) {
      fields = Object.keys(result[0] as object).map((name, index) => ({
        name,
        type: index,
      }));
    }

    return {
      success: true,
      data: result as any[],
      fields,
    };
  } catch (error: any) {
    return { success: false, error: error?.message };
  }
};
