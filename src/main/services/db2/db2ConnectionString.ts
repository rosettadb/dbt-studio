import { Db2Connection } from '../../../types/backend';
import { validateDb2Fields } from '../../../shared/db2';

export const DB2_CONNECT_TIMEOUT_SECONDS = 10;

/**
 * Builds the Db2 CLI connection string. The Db2 CLI driver has no quoting
 * (`{...}` is taken literally), so any field that could end a keyword is
 * rejected by `validateDb2Fields`: `;` everywhere, and also `{`, `}` outside
 * the password. Throws with a field-level message instead of building an
 * unsafe string.
 */
export const buildDb2ConnectionString = (connection: Db2Connection): string => {
  const errors = validateDb2Fields(connection);
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.message).join('; '));
  }

  const parts = [
    `DATABASE=${connection.database.trim()}`,
    `HOSTNAME=${connection.host.trim()}`,
    `PORT=${connection.port}`,
    'PROTOCOL=TCPIP',
    `UID=${connection.username}`,
    `PWD=${connection.password ?? ''}`,
    `ConnectTimeout=${DB2_CONNECT_TIMEOUT_SECONDS}`,
    // Describe DECFLOAT as CHAR so values arrive as exact strings. The driver
    // always converts DECIMAL to a JS number; that can't be changed here.
    'MapDecimalFloatDescribe=1',
  ];

  if (connection.schema?.trim()) {
    parts.push(`CurrentSchema=${connection.schema.trim()}`);
  }

  if (connection.ssl) {
    parts.push('Security=SSL');
    if (connection.sslCaPath?.trim()) {
      parts.push(`SSLServerCertificate=${connection.sslCaPath.trim()}`);
    }
  }

  return `${parts.join(';')};`;
};

/**
 * Removes the password from driver messages before they reach logs or the
 * renderer. The CLI driver can echo the connection string in some errors.
 */
export const scrubDb2Secrets = (message: string, password?: string): string => {
  let scrubbed = message.replace(/PWD=[^;]*/gi, 'PWD=***');
  if (password && password.length >= 3) {
    scrubbed = scrubbed.split(password).join('***');
  }
  return scrubbed;
};
