// Main-process half: how Studio reaches a ClickHouse server. It talks to
// ClickHouse's HTTP interface with Node's own `fetch`, so the extension has
// no dependencies and can be installed as it is.
//
// A saved connection looks like:
//   { type: 'clickhouse', name, host, port, secure, username, password, database }

const SYSTEM_DATABASES = ['system', 'INFORMATION_SCHEMA', 'information_schema'];

// The same facts are given to `api.connections.register` in renderer.js.
const descriptor = {
  type: 'clickhouse',
  displayName: 'ClickHouse',
  sql: { rules: { quote: 'backtick', folding: 'none', limit: 'limit' } },
};

const endpoint = (conn) => {
  const protocol = conn.secure ? 'https' : 'http';
  const port = conn.port || (conn.secure ? 8443 : 8123);
  const url = new URL(`${protocol}://${conn.host}:${port}/`);
  if (conn.database) url.searchParams.set('database', conn.database);
  // Rows come back as arrays, with the column names and types next to them.
  url.searchParams.set('default_format', 'JSONCompact');
  return url;
};

// Sends one statement. Resolves with the parsed answer, or null when the
// statement returns nothing (CREATE, INSERT, ...). Rejects with ClickHouse's
// own message.
const send = async (conn, sql, signal) => {
  const headers = { 'X-ClickHouse-User': conn.username || 'default' };
  if (conn.password) headers['X-ClickHouse-Key'] = conn.password;

  const response = await fetch(endpoint(conn), {
    method: 'POST',
    headers,
    body: sql,
    signal,
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text.trim() || `ClickHouse answered ${response.status}`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    // A statement with its own FORMAT clause: hand the text back as one cell.
    return { meta: [{ name: 'result', type: 'String' }], data: [[text]] };
  }
};

const validate = async (conn) => {
  if (!conn.host) throw new Error('Host is required');
  if (conn.port && !Number.isInteger(Number(conn.port))) {
    throw new Error('Port must be a number');
  }
};

const test = async (conn) => {
  const answer = await send(conn, 'SELECT 1');
  return answer?.data?.[0]?.[0] === 1;
};

const query = async (conn, sql, ctx) => {
  const controller = new AbortController();
  // Lets the Stop button cancel the statement.
  if (ctx && ctx.onCancelable) ctx.onCancelable(() => controller.abort());

  try {
    const answer = await send(conn, sql, controller.signal);
    if (!answer) {
      return { success: true, data: [], fields: [], rowCount: 0 };
    }
    const names = answer.meta.map((column) => column.name);
    const data = answer.data.map((row) =>
      Object.fromEntries(names.map((name, index) => [name, row[index]])),
    );
    return {
      success: true,
      data,
      fields: names.map((name) => ({ name, type: -1 })),
      rowCount: data.length,
    };
  } catch (error) {
    return {
      success: false,
      error: controller.signal.aborted
        ? 'Query cancelled'
        : error.message || String(error),
    };
  }
};

// The tables and views of every user database, for the Data tree and for
// completions. The tree groups them by `schema`, which is the ClickHouse
// database here.
const extractSchema = async (conn) => {
  const excluded = SYSTEM_DATABASES.map((name) => `'${name}'`).join(', ');
  const answer = await send(
    conn,
    `SELECT c.database, c.table, c.name, c.type, c.position, c.is_in_primary_key,
            t.engine
       FROM system.columns AS c
       INNER JOIN system.tables AS t
          ON t.database = c.database AND t.name = c.table
      WHERE c.database NOT IN (${excluded})
      ORDER BY c.database, c.table, c.position`,
  );

  const tables = new Map();
  ((answer && answer.data) || []).forEach(
    ([database, table, name, type, position, isInPrimaryKey, engine]) => {
      const key = `${database}.${table}`;
      if (!tables.has(key)) {
        tables.set(key, {
          name: table,
          type: /View$/.test(engine) ? 'VIEW' : 'TABLE',
          schema: database,
          columns: [],
        });
      }
      tables.get(key).columns.push({
        name,
        typeName: type,
        ordinalPosition: Number(position),
        primaryKeySequenceId: 0,
        columnDisplaySize: 0,
        scale: 0,
        precision: 0,
        columnProperties: [],
        autoincrement: false,
        primaryKey: Number(isInPrimaryKey) === 1,
        nullable: /^Nullable\(/.test(type),
        foreignKeys: [],
      });
    },
  );
  return { tables: Array.from(tables.values()) };
};

exports.activate = (api) => {
  // From here on Studio can save, test and query ClickHouse connections,
  // and show their tables. Removed again when the extension is disabled.
  api.connections.register({
    descriptor,
    validate,
    test,
    query,
    extractSchema,
    // Two saved connections are the same database when these match.
    sameTarget: (a, b) =>
      a.host === b.host &&
      Number(a.port) === Number(b.port) &&
      (a.database || '') === (b.database || ''),
    nameHint: (conn) => conn.database || conn.host || conn.name,
    agentHint: () =>
      '\n\n## Dialect Specifics\nYou are connected to a ClickHouse database. Use ClickHouse SQL: backticks for identifiers, `LIMIT n`, and ClickHouse functions (toDate, toStartOfMonth, uniq, arrayJoin).',
  });

  api.log.info('ClickHouse connections are available');
};

// For the example's own test.
exports.internals = { descriptor, endpoint, validate, test, query, extractSchema };
