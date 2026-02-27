/**
 * Shared Schema Loading Hook
 * Loads schema for both DB connections and DuckLake instances
 */

import { useQuery } from 'react-query';
import { connectorsServices } from '../services';
import { DuckLakeService } from '../services/duckLake.service';
import { Table } from '../../types/backend';
import { DuckLakeSchemaInfo } from '../../types/duckLake';

interface SchemaResult {
  tables: Table[];
  duckLakeSchema: DuckLakeSchemaInfo | null;
  isDuckLake: boolean;
}

export function useSchemaForConnection(connectionId: string | undefined) {
  return useQuery<SchemaResult>({
    queryKey: ['schema', connectionId],
    queryFn: async () => {
      if (!connectionId) {
        return { tables: [], duckLakeSchema: null, isDuckLake: false };
      }

      // Handle DuckLake connections
      if (connectionId.startsWith('ducklake-')) {
        const instanceId = connectionId.replace('ducklake-', '');
        const duckLakeSchema = await DuckLakeService.extractSchema(instanceId);

        // Convert DuckLake schema to Table[] format for compatibility
        const tables: Table[] = [];
        duckLakeSchema.schemas.forEach((schema) => {
          schema.tables.forEach((table) => {
            tables.push({
              name: table.name,
              schema: schema.name,
              columns: table.columns.map((col) => ({
                name: col.name,
                type: col.type,
                nullable: true,
              })),
            });
          });
        });

        return { tables, duckLakeSchema, isDuckLake: true };
      }

      // Handle regular DB connections
      const result =
        await connectorsServices.extractSchemaFromConnection(connectionId);

      if (result.error || !result.tables) {
        return { tables: [], duckLakeSchema: null, isDuckLake: false };
      }

      return { tables: result.tables, duckLakeSchema: null, isDuckLake: false };
    },
    enabled: !!connectionId,
    staleTime: 60000, // Cache for 1 minute
  });
}
