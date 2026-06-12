// src/main/services/ai/tools/toolRegistry.ts
export const TOOL_FLAGS: Record<string, boolean> = {
  'studio.connections.list': true,
  'studio.connections.test': true,
  'studio.sql.schema_extract': true,
  'studio.sql.query': true,
  'studio.sql.get_query_results': true,
  'studio.sql.get_agent_run_result': true,
  'studio.monaco.read': true,
  'studio.monaco.update': true,
  'studio.ducklake.schema_extract': true,
  'studio.ducklake.query': true,
  'studio.cloud.list_objects': true,
  'studio.cloud.preview_data': true,
  'studio.cloud.connection_test': true,
  'studio.cli.run_dbt': true,
  notebooks_get_state: true,
  notebooks_cell_read: true,
  notebooks_cell_add: true,
  notebooks_cell_update: true,
  notebooks_cell_run: true,
  notebooks_cell_result: true,
};

export function isToolEnabled(flag: string): boolean {
  return TOOL_FLAGS[flag] ?? false;
}
