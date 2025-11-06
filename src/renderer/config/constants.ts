export const DB_TYPES = [
  'mysql',
  'mariadb',
  'sqlite',
  'postgres',
  'mssql',
  'oracle',
  'mongodb',
  'sqljs',
  'react-native',
  'expo',
  'aurora-data-api',
  'cockroachdb',
  'aurora',
  'cockroach',
  'aurora-serverless',
] as const;

export const CONNECTORS = [
  {
    name: 'PostgreSQL',
    img: 'postgresql',
  },
  {
    name: 'MySQL',
    img: 'mysql',
  },
  {
    name: 'Snowflake',
    img: 'snowflake',
  },
  {
    name: 'BigQuery',
    img: 'bigquery',
  },
  {
    name: 'Oracle',
    img: 'oracle',
  },
  {
    name: 'Redshift',
    img: 'redshift',
  },
] as const;

export const QUERY_KEYS = {
  GET_SETTINGS: 'GET_SETTINGS',
  CHECK_CLI_UPDATES: 'CHECK_CLI_UPDATES',
  GET_PROJECTS: 'GET_PROJECTS',
  GET_CONNECTIONS: 'GET_CONNECTIONS',
  GET_CONNECTION_BY_ID: 'GET_CONNECTION_BY_ID',
  GET_SELECTED_PROJECT: 'GET_SELECTED_PROJECT',
  GET_PROJECT_BY_ID: 'GET_PROJECT_BY_ID',
  GET_FILE_CONTENT: 'GET_FILE_CONTENT',
  SAVE_FILE_CONTENT: 'SAVE_FILE_CONTENT',
  GET_FILE_STRUCTURE: 'GET_FILE_STRUCTURE',
  EXTRACT_SCHEMA: 'EXTRACT_SCHEMA',
  GIT_IS_INITIALIZED: 'GIT_IS_INITIALIZED',
  GIT_INIT: 'GIT_INIT',
  GIT_REMOTES: 'GIT_REMOTES',
  GIT_BRANCHES: 'GIT_BRANCHES',
  GIT_STATUSES: 'GIT_STATUSES',
  GIT_STATUS: 'GIT_STATUS',
  GIT_DIFF: 'GIT_DIFF',
  GIT_LOCAL_CHANGES: 'GIT_LOCAL_CHANGES',
  GIT_REPO_INFO: 'GIT_REPO_INFO',
  GET_AI_PROVIDERS: 'GET_AI_PROVIDERS',
  GET_AI_PROVIDER_BY_ID: 'GET_AI_PROVIDER_BY_ID',
  GET_ACTIVE_AI_PROVIDER: 'GET_ACTIVE_AI_PROVIDER',
  GET_AI_PROVIDER_MODELS: 'GET_AI_PROVIDER_MODELS',
  GET_ALL_AI_PROVIDER_MODELS: 'GET_ALL_AI_PROVIDER_MODELS',
  AI_PROVIDER_HEALTH_CHECK: 'AI_PROVIDER_HEALTH_CHECK',
  GET_CHAT_SESSIONS: 'GET_CHAT_SESSIONS',
  GET_CHAT_SESSION_BY_ID: 'GET_CHAT_SESSION_BY_ID',
  GET_CHAT_MESSAGES: 'GET_CHAT_MESSAGES',
  GET_CHAT_MESSAGE_WITH_CONTEXT: 'GET_CHAT_MESSAGE_WITH_CONTEXT',
  GET_CONTEXT_ITEMS: 'GET_CONTEXT_ITEMS',
  GET_TOOL_CALLS: 'GET_TOOL_CALLS',
  GET_SESSION_METADATA: 'GET_SESSION_METADATA',
  API_KEY: 'API_KEY',
  USER_PROFILE: 'USER_PROFILE',
  CLOUD_SECRETS: 'CLOUD_SECRETS',
};

export const AI_PROMPTS = {
  BASIC_TRANSFORM_PROMPT_WITH_TABLE:
    'I have a raw source table {} with the following schema:\n\n' +
    '{}\n\n' +
    'And the current {} dbt model looks like this:\n\n' +
    '{}\n\n' +
    'We are using {}\n\n' +
    'Please recommend only basic transformations following the best practices. Respond with the full formatted dbt model SQL using those basic transformations and nothing else, and make sure response is a proper markdown.',
  BASIC_TRANSFORM_PROMPT_WITHOUT_TABLE:
    'The current {} dbt model looks like this:\n\n' +
    '{}\n\n' +
    'We are using {}\n\n' +
    'Please recommend only basic transformations following the best practices. Respond with the full formatted dbt model SQL using those basic transformations and nothing else, and make sure response is a proper markdown.',
  ENHANCE_ENHANCED_MODEL:
    'Given the following dbt model SQL, identify and replace:\n' +
    "\t•\t'UNIQUE_KEY_COLUMNS' with a list of column(s) that uniquely identify each row.\n" +
    "\t•\t'INCREMENTAL_COLUMN' with the best column to use for incremental loading—typically a timestamp or increasing numeric ID.\n" +
    '\n' +
    'We are using {}\n\n' +
    "Return the updated SQL with correct replacements and do not explain the changes unless asked. Here's the SQL:\n\n{}\n\n Make sure response is a proper markdown.",
  GENERATE_DASHBOARDS:
    'Here is a business dbt model for the table {}. Make sure you use the table name given in this prompt as reference. We are using {}. Make sure the SQL syntax matches the used DB.\n\nSuggest me some good SQL for Dashboards on. Generate 5-10 queries.\n\n{}\n\nMake sure response is a proper markdown.',
};

export const MonacoCompletionItemKind = {
  Keyword: 14,
  Module: 9,
  Struct: 22,
  Field: 5,
  Value: 12,
} as const;

export const MonacoAutocompleteSQLKeywords = [
  'SELECT',
  'FROM',
  'WHERE',
  'JOIN',
  'INNER JOIN',
  'LEFT JOIN',
  'RIGHT JOIN',
  'FULL OUTER JOIN',
  'ON',
  'GROUP BY',
  'ORDER BY',
  'INSERT INTO',
  'VALUES',
  'UPDATE',
  'SET',
  'DELETE',
  'CREATE TABLE',
  'ALTER TABLE',
  'DROP TABLE',
  'CREATE DATABASE',
  'DROP DATABASE',
  'USE',
  'AS',
  'AND',
  'OR',
  'NOT',
  'IN',
  'IS NULL',
  'IS NOT NULL',
  'DISTINCT',
  'LIMIT',
  'OFFSET',
  'HAVING',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
] as const;
