import type React from 'react';
import type { ConnectionModel } from '../../types/backend';
import type {
  ConnectionInput,
  SupportedConnectionTypes,
} from '../registry.shared';
import type {
  ParsedStatement,
  SqlStatementModel,
} from '../../renderer/components/sqlEditor/editorComponent/statements';

/** Props every connection form takes today (one type for all forms). */
export type ConnectionFormProps = {
  onCancel: () => void;
  connection?: ConnectionModel;
  projectId?: string;
  duplicateFrom?: ConnectionModel;
  suggestedName?: string;
};

/** What the SQL editor screen receives (today's getConnectionInput result). */
export type SqlEditorConnectionInput = {
  type: SupportedConnectionTypes;
  [key: string]: unknown;
};

export type ImportPromptField = { field: string; label: string };

export type ConnectionUi<T extends ConnectionInput = ConnectionInput> = {
  type: T['type'];
  /** Image URL (imported image module). */
  icon: string;
  /** Chip color in the connection list and project sidebar. Undefined → '#666'. */
  accentColor?: string;
  /** Add and edit form. Absent: no add-screen tile (DuckLake). */
  Form?: React.ComponentType<ConnectionFormProps>;
  /** Today's getConnectionInput case (helpers/utils.ts). */
  sqlEditorInput?: (conn: T) => SqlEditorConnectionInput;
  /** Text under the name in the connection list (today's renderConnectionDetails). */
  listDetails?: (conn: T) => string | null;
  /** SQL editor statement splitter (Oracle PL/SQL). Default: parseSqlEditorStatements. */
  parseEditorStatements?: (model: SqlStatementModel) => ParsedStatement[];
  /** `db-<field>-<name>` env vars set before dbt and Rosetta runs (today's fieldMap). */
  envFields?: readonly string[];
  /** Derived fields (Kinetica `url`); undefined falls back to defaultEnvFieldValue. */
  envFieldValue?: (conn: T, field: string) => string | undefined;
  /** Browser OAuth that needs a session token before runs (Snowflake). */
  browserAuth?: { isEnabled: (conn: T) => boolean };
  /** Fields the notebook import dialog asks for (never exported). Unused today. */
  importPromptFields?: (conn: T) => ImportPromptField[];
};
