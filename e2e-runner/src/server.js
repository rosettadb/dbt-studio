require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');

const db = require('./db');
const { listBranches } = require('./git');
const {
  executeRun,
  cancelRun,
  finalizeOrphan,
  reconcileOrphans,
} = require('./runner');
const { enqueue, cancelQueued } = require('./queue');
const {
  emitter,
  getBuffer,
  emitStatus,
  MAX_BUFFER_LINES,
} = require('./logBus');

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
  return res.json({ run });
});

app.post('/api/runs', (req, res) => {
  const { branch } = req.body || {};
  if (!branch || typeof branch !== 'string') {
    return res.status(400).json({ error: 'branch is required' });
  }
  const run = db.createRun(branch);
  enqueue(run.id, () => executeRun(run));
  return res.status(201).json({ run });
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
    // Not queued, not in flight, yet not terminal: the run was orphaned by a
    // runner restart. Nothing else is going to close it out, so do it here.
    const updated = await finalizeOrphan(
      runId,
      'cancelled',
      'stopped: no container is tracked for this run (runner restarted while it was in progress)',
    );
    return res.json({ run: updated });
  }
  // executeRun's own finally block updates status to "cancelled" once the
  // container actually stops; the client picks that up over the SSE stream.
  return res.json({ run: db.getRun(runId) });
});

app.get('/api/runs/:id/stream', (req, res) => {
  const runId = Number(req.params.id);

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  // The client clears its view on this so an EventSource reconnect (server
  // restart, dropped connection) doesn't append the replay below the lines it
  // already shows.
  res.write('event: reset\ndata: null\n\n');

  // Replay past output: prefer the in-memory buffer, but fall back to the
  // log file on disk so a run's history survives a server restart. Only the
  // tail is sent — the browser keeps the same number of lines anyway.
  let pastLines = getBuffer(runId);
  if (pastLines.length === 0) {
    const logPath = path.join(db.dataDir, 'runs', String(runId), 'output.log');
    if (fs.existsSync(logPath)) {
      pastLines = fs
        .readFileSync(logPath, 'utf8')
        .split('\n')
        .filter(Boolean)
        .slice(-MAX_BUFFER_LINES);
    }
  }
  pastLines.forEach((line) => {
    res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  });

  const run = db.getRun(runId);
  if (run) res.write(`event: status\ndata: ${JSON.stringify(run.status)}\n\n`);

  const onLog = (line) =>
    res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  const onStatus = (status) =>
    res.write(`event: status\ndata: ${JSON.stringify(status)}\n\n`);

  emitter.on(`log:${runId}`, onLog);
  emitter.on(`status:${runId}`, onStatus);

  req.on('close', () => {
    emitter.off(`log:${runId}`, onLog);
    emitter.off(`status:${runId}`, onStatus);
  });
});

app.use('/api/runs/:id/report', (req, res, next) => {
  const reportDir = path.join(
    db.dataDir,
    'runs',
    req.params.id,
    'report',
    'html',
  );
  if (!fs.existsSync(reportDir)) {
    res.status(404).send('Report not available for this run');
    return;
  }

  // The trace viewer's service worker (trace/sw.bundle.js) intercepts
  // absolute-root requests like /snapshot to render each step's captured
  // screenshot. Served from a subpath, a worker only controls that subpath
  // by default — this header is what lets it claim the whole origin instead,
  // the same thing Playwright's own `show-report` server sends. Without it,
  // every trace step falls back to the same blank frame.
  if (req.path.endsWith('sw.bundle.js')) {
    res.set('Service-Worker-Allowed', '/');
  }

  express.static(reportDir)(req, res, next);
});

const port = process.env.PORT || 4300;
reconcileOrphans()
  .then((count) => {
    if (count > 0) {
      // eslint-disable-next-line no-console -- startup housekeeping is intended output
      console.log(
        `e2e-runner: closed out ${count} run(s) left over from a previous process`,
      );
    }
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(
      `e2e-runner: failed to reconcile leftover runs: ${err.message}`,
    );
  })
  .finally(() => {
    app.listen(port, () => {
      // eslint-disable-next-line no-console -- a server announcing its port is intended output
      console.log(`e2e-runner listening on :${port}`);
    });
  });
