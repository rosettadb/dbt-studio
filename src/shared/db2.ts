/**
 * Db2 (LUW) connection rules shared by the main process and the connection
 * form. Pure functions only: no Node or Electron imports.
 */

export const DB2_DEFAULT_PORT = 50000;
export const DB2_DEFAULT_SSL_PORT = 50001;

/** Rows returned to the SQL Editor before the result is cut off. */
export const DB2_MAX_ROWS = 10_000;

/** Oldest supported server: 11.1 is the first release with native OFFSET. */
export const DB2_MIN_SERVER_VERSION = { major: 11, minor: 1 } as const;

export type Db2ConnectionFields = {
  host?: string;
  port?: number;
  database?: string;
  schema?: string;
  username?: string;
  password?: string;
  ssl?: boolean;
  sslCaPath?: string;
};

export type Db2FieldName = keyof Db2ConnectionFields;

export type Db2FieldError = { field: Db2FieldName; message: string };

// The Db2 CLI connection string has no quoting: `;` always ends a value.
// Braces are rejected in the non-secret fields too, so a later driver that
// does honour ODBC brace quoting can't reinterpret them.
// eslint-disable-next-line no-control-regex
const CONNECTION_STRING_BREAKERS = /[;{}\u0000-\u001f\u007f]/;
// eslint-disable-next-line no-control-regex
const PASSWORD_BREAKERS = /[;\u0000-\u001f\u007f]/;
const DATABASE_NAME = /^[A-Za-z0-9@#$_]{1,8}$/;

const breaks = (value: string) => CONNECTION_STRING_BREAKERS.test(value);

/**
 * Validates the fields that end up in the Db2 CLI connection string.
 * Returns every problem so the form can show them next to each field.
 */
export const validateDb2Fields = (
  fields: Db2ConnectionFields,
): Db2FieldError[] => {
  const errors: Db2FieldError[] = [];
  const host = fields.host?.trim() ?? '';
  const database = fields.database?.trim() ?? '';
  const username = fields.username ?? '';

  if (!host) {
    errors.push({ field: 'host', message: 'Host is required' });
  } else if (breaks(host) || /\s/.test(host) || host.length > 255) {
    errors.push({
      field: 'host',
      message: 'Host must be a hostname or IP address without spaces, ; { }',
    });
  }

  if (
    !Number.isInteger(fields.port) ||
    (fields.port as number) < 1 ||
    (fields.port as number) > 65535
  ) {
    errors.push({ field: 'port', message: 'Port must be 1–65535' });
  }

  if (!database) {
    errors.push({ field: 'database', message: 'Database is required' });
  } else if (!DATABASE_NAME.test(database)) {
    errors.push({
      field: 'database',
      message:
        'Db2 database names are 1–8 letters, digits, or @ # $ _ (for example TESTDB or BLUDB)',
    });
  }

  if (fields.schema && (breaks(fields.schema) || fields.schema.length > 128)) {
    errors.push({
      field: 'schema',
      message: 'Schema must be at most 128 characters without ; { }',
    });
  }

  if (!username.trim()) {
    errors.push({ field: 'username', message: 'Username is required' });
  } else if (breaks(username) || username.length > 128) {
    errors.push({
      field: 'username',
      message: 'Username must be at most 128 characters without ; { }',
    });
  }

  if (fields.password && PASSWORD_BREAKERS.test(fields.password)) {
    errors.push({
      field: 'password',
      message:
        'The Db2 driver cannot send a password that contains ; (or control characters). Change the password on the server.',
    });
  }

  if (fields.ssl && fields.sslCaPath && breaks(fields.sslCaPath)) {
    errors.push({
      field: 'sslCaPath',
      message: 'Certificate path cannot contain ; { }',
    });
  }

  return errors;
};

/**
 * Parses an ODBC `SQL_DBMS_VER` value such as `11.05.0900` into major/minor.
 */
export const parseDb2Version = (
  raw: string | number | null | undefined,
): { major: number; minor: number } | null => {
  if (raw === null || raw === undefined) return null;
  const match = /^(\d+)\.(\d+)/.exec(String(raw).trim());
  if (!match) return null;
  return { major: Number(match[1]), minor: Number(match[2]) };
};

export const isSupportedDb2Version = (version: {
  major: number;
  minor: number;
}): boolean =>
  version.major > DB2_MIN_SERVER_VERSION.major ||
  (version.major === DB2_MIN_SERVER_VERSION.major &&
    version.minor >= DB2_MIN_SERVER_VERSION.minor);
