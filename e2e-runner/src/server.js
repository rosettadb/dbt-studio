require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');

const db = require('./db');
const { listBranches } = require('./git');
const { executeRun } = require('./runner');
const { enqueue } = require('./queue');
const { emitter, getBuffer } = require('./logBus');

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
  enqueue(() => executeRun(run));
  res.status(201).json({ run });
});

app.get('/api/runs/:id/stream', (req, res) => {
  const runId = Number(req.params.id);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  getBuffer(runId).forEach((line) => {
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
