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

function createRun(branch) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO runs (branch, status) VALUES (?, ?)')
    .run(branch, 'queued');
  return getRun(lastInsertRowid);
}

function getRun(id) {
  return db.prepare('SELECT * FROM runs WHERE id = ?').get(id);
}

function listRuns(limit = 100) {
  return db
    .prepare('SELECT * FROM runs ORDER BY id DESC LIMIT ?')
    .all(limit);
}

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
