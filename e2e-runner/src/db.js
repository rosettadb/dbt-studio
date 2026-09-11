const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'runs.sqlite'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    branch TEXT NOT NULL,
    commit_sha TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    exit_code INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    started_at TEXT,
    finished_at TEXT
  );
`);

/**
 * Looks up a single run by id.
 *
 * @param {number} id Run id.
 * @returns {object|undefined} The run row, or undefined if no such run exists.
 */
function getRun(id) {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
}

/**
 * Inserts a new run for a branch in the "queued" state.
 *
 * @param {string} branch Branch name to test.
 * @returns {object} The newly created run row.
 */
function createRun(branch) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO runs (branch, status) VALUES (?, ?)')
    .run(branch, 'queued');
  return getRun(lastInsertRowid);
}

/**
 * Returns runs newest first, for the history table.
 *
 * @param {number} [limit=100] Maximum number of runs to return.
 * @returns {object[]} Run rows, ordered by descending id.
 */
function listRuns(limit = 100) {
  return db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?').all(limit);
}

/**
 * Updates the given columns on a run. Column names are interpolated into the
 * SQL, so `fields` keys must only ever come from this codebase — never from
 * request data.
 *
 * @param {number} id Run id.
 * @param {object} fields Column/value pairs to write; an empty object is a no-op.
 * @returns {object|undefined} The run row after the update.
 */
function updateRun(id, fields) {
  const keys = Object.keys(fields);
  if (keys.length === 0) return getRun(id);
  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const values = keys.map((k) => fields[k]);
  db.prepare(`UPDATE runs SET ${setClause} WHERE id = ?`).run(...values, id);
  return getRun(id);
}

module.exports = {
  dataDir,
  createRun,
  getRun,
  listRuns,
  updateRun,
};
