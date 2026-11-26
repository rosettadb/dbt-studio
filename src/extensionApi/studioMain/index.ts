/**
 * Pieces of Studio's main process that extensions may use. One small file
 * per Studio module, each re-exporting from exactly that module.
 *
 * Internal extensions import these files; an installed extension gets this
 * same list at run time as `api.studio`. Every file in this folder is listed
 * here (a test checks it), so there is nothing an internal extension can use
 * that an installed one cannot.
 */
// Agents and their building blocks
export * from './aiSdk';
export * from './agentBase';
export { default as AgentService } from './agentService';
export * from './agentTypes';
export * from './composeAgentRuntime';
export * from './terminalConfirmGate';
export * from './tokenEstimator';
export * from './toolRegistry';
// Tool sets an agent can be given
export * from './cloudTools';
export * from './connectionsTools';
export * from './dbtTools';
export * from './duckLakeTools';
export * from './filesystemTools';
export * from './sqlTools';
// Connections and data
export * from './connectionEvents';
export * from './connectionsRegistry';
export { default as ConnectorsService } from './connectorsService';
export { default as databaseStore } from './database';
export { default as DuckLakeService } from './duckLakeService';
export * from './ducklakeShared';
export { default as MainDatabaseService } from './mainDatabaseService';
// Settings, installs, processes, windows
export * from './adapters';
export * from './fileEvents';
export * from './installTask';
export * from './installTasksShared';
export { default as PythonRuntimesService } from './pythonRuntimesService';
export * from './rendererBroadcast';
export * from './services';
export { RECOMMENDED_PYTHON_VERSION } from './settingsService';
// Links the Notebooks extension gives Studio
export * from './notebookCatalog';
// Types
export * from './analyticsPagesTypes';
export * from './notebooksTypes';
export * from './pythonNotebooksTypes';
export * from './types';
