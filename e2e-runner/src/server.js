require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');

const db = require('./db');
const { listBranches } = require('./git');
const { executeRun, cancelRun } = require('./runner');
const { enqueue, cancelQueued } = require('./queue');
const { emitter, getBuffer, emitStatus } = require('./logBus');

const TERMINAL_STATUSES = ['passed', 'failed', 'error', 'cancelled'];

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/branches', async (_req, res) => {
  try {
    res.json({ branches: await listBranches() });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

app.get('/api/runs', (_req, res) => {
  res.json({ runs: db.listRuns() });
});

app.get('/api/runs/:id', (req, res) => {
  const run = db.getRun(Number(req.params.id));
  if (!run) return res.status(404).json({ error: 'not found' });
  res.json({ run });
});

app.post('/api/runs', (req, res) => {
  const { branch } = req.body || {};
  if (!branch || typeof branch !== 'string') {
    return res.status(400).json({ error: 'branch is required' });
  }
  const run = db.createRun(branch);
  enqueue(run.id, () => executeRun(run));
  res.status(201).json({ run });
});

app.post('/api/runs/:id/cancel', async (req, res) => {
  const runId = Number(req.params.id);
  const run = db.getRun(runId);
  if (!run) return res.status(404).json({ error: 'not found' });
  if (TERMINAL_STATUSES.includes(run.status)) {
    return res.status(409).json({ error: `run already ${run.status}` });
  }

  if (cancelQueued(runId)) {
    const updated = db.updateRun(runId, {
      status: 'cancelled',
      finished_at: new Date().toISOString(),
    });
    emitStatus(runId, 'cancelled');
    return res.json({ run: updated });
  }

  const stopped = await cancelRun(runId);
  if (!stopped) {
    return res.status(409).json({ error: 'run is finishing up, could not cancel in time' });
  }
  // executeRun's own finally block updates status to "cancelled" once the
  // container actually stops; the client picks that up over the SSE stream.
  res.json({ run: db.getRun(runId) });
});

app.get('/api/runs/:id/stream', (req, res) => {
  const runId = Number(req.params.id);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // Replay past output: prefer the in-memory buffer, but fall back to the
  // log file on disk so a run's history survives a server restart.
  let pastLines = getBuffer(runId);
  if (pastLines.length === 0) {
    const logPath = path.join(db.dataDir, 'runs', String(runId), 'output.log');
    if (fs.existsSync(logPath)) {
      pastLines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
    }
  }
  pastLines.forEach((line) => {
    res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  });

  const run = db.getRun(runId);
  if (run) res.write(`event: status\ndata: ${JSON.stringify(run.status)}\n\n`);

  const onLog = (line) => res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  const onStatus = (status) => res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);

  emitter.on(`log:${runId}`, onLog);
  emitter.on(`status:${runId}`, onStatus);

  req.on('close', () => {
    emitter.off(`log:${runId}`, onLog);
    emitter.off(`status:${runId}`, onStatus);
  });
});

app.use('/api/runs/:id/report', (req, res, next) => {
  const reportDir = path.join(db.dataDir, 'runs', req.params.id, 'report', 'html');
  if (!fs.existsSync(reportDir)) return res.status(404).send('Report not available for this run');
  express.static(reportDir)(req, res, next);
});

const port = process.env.PORT || 4300;
app.listen(port, () => {
  console.log(`e2e-runner listening on :${port}`);
});
