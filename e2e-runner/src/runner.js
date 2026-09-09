const path = require('path');
const fs = require('fs');
const { Writable } = require('stream');
const Docker = require('dockerode');
const tar = require('tar-fs');

const db = require('./db');
const { authenticatedUrl, redact } = require('./git');
const { appendLog, emitStatus } = require('./logBus');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const TEST_RUNNER_IMAGE = process.env.TEST_RUNNER_IMAGE || 'e2e-test-runner:latest';
const NPM_CACHE_VOLUME = 'e2e-runner-npm-cache';
const PLAYWRIGHT_CACHE_VOLUME = 'e2e-runner-playwright-cache';

const activeContainers = new Map(); // runId -> dockerode container
const cancelledRuns = new Set();

// Stops a run's container if it's currently active. Returns false if the
// run isn't in this map (already finished, or never started — the caller
// should try queue.cancelQueued for that case instead).
async function cancelRun(runId) {
  const container = activeContainers.get(runId);
  if (!container) return false;
  cancelledRuns.add(runId);
  try {
    await container.stop({ t: 5 }); // SIGTERM, then SIGKILL after 5s if still stuck
  } catch (_) {
    // already stopped/removed
  }
  return true;
}

function runDir(runId) {
  const dir = path.join(db.dataDir, 'runs', String(runId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Splits arbitrary chunked output into whole lines and forwards each one.
function lineSplitter(onLine) {
  let buffer = '';
  return new Writable({
    write(chunk, _enc, cb) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop();
      lines.forEach(onLine);
      cb();
    },
    final(cb) {
      if (buffer) onLine(buffer);
      cb();
    },
  });
}

async function extractReport(container, dir) {
  const reportDir = path.join(dir, 'report');
  fs.mkdirSync(reportDir, { recursive: true });
  try {
    const archiveStream = await container.getArchive({ path: '/app/test-results' });
    await new Promise((resolve, reject) => {
      archiveStream
        .pipe(tar.extract(reportDir, { strip: 1 }))
        .on('finish', resolve)
        .on('error', reject);
    });
  } catch (err) {
    // Container may exit before producing any test-results (e.g. build
    // failure) — that's a normal outcome, not a runner bug.
    appendLog(container.__runId, `[runner] no test-results archive to collect: ${err.message}`);
  }
}

async function executeRun(run) {
  const runId = run.id;
  const dir = runDir(runId);
  const logStream = fs.createWriteStream(path.join(dir, 'output.log'), { flags: 'a' });

  const log = (line) => {
    const commitMatch = /^COMMIT_SHA=([0-9a-f]{7,40})$/.exec(line.trim());
    if (commitMatch) db.updateRun(runId, { commit_sha: commitMatch[1] });
    appendLog(runId, line);
    logStream.write(`${line}\n`);
  };

  db.updateRun(runId, { status: 'running', started_at: new Date().toISOString() });
  emitStatus(runId, 'running');
  log(`[runner] starting run for branch "${run.branch}"`);

  let container;
  try {
    const gitUrl = authenticatedUrl();

    container = await docker.createContainer({
      Image: TEST_RUNNER_IMAGE,
      Env: [`GIT_URL=${gitUrl}`, `BRANCH=${run.branch}`],
      HostConfig: {
        AutoRemove: false,
        Binds: [
          `${NPM_CACHE_VOLUME}:/root/.npm`,
          `${PLAYWRIGHT_CACHE_VOLUME}:/root/.cache/ms-playwright`,
        ],
        ShmSize: 1024 * 1024 * 1024, // Electron/Chromium need more than Docker's 64MB default
        // Docker's default seccomp profile blocks syscalls Chromium's renderer
        // still uses even with --no-sandbox, which silently stalls window
        // creation. This container only ever runs this repo's own test suite,
        // so relaxing it here is the standard, low-risk fix for that.
        SecurityOpt: ['seccomp=unconfined'],
      },
    });
    container.__runId = runId;
    activeContainers.set(runId, container);

    const attachStream = await container.attach({ stream: true, stdout: true, stderr: true });
    const stdoutSplitter = lineSplitter((line) => log(redact(line)));
    const stderrSplitter = lineSplitter((line) => log(redact(line)));
    container.modem.demuxStream(attachStream, stdoutSplitter, stderrSplitter);

    await container.start();

    const waitResult = await container.wait();
    const exitCode = waitResult.StatusCode;

    await extractReport(container, dir);

    const wasCancelled = cancelledRuns.delete(runId);
    const status = wasCancelled ? 'cancelled' : exitCode === 0 ? 'passed' : 'failed';
    db.updateRun(runId, {
      status,
      exit_code: exitCode,
      finished_at: new Date().toISOString(),
    });
    emitStatus(runId, status);
    log(`[runner] run ${wasCancelled ? 'cancelled' : `finished with exit code ${exitCode}`}`);
  } catch (err) {
    log(`[runner] error: ${redact(err.message)}`);
    db.updateRun(runId, { status: 'error', finished_at: new Date().toISOString() });
    emitStatus(runId, 'error');
  } finally {
    activeContainers.delete(runId);
    cancelledRuns.delete(runId);
    logStream.end();
    if (container) {
      try {
        await container.remove({ force: true });
      } catch (_) {
        // already removed
      }
    }
  }
}

module.exports = { executeRun, cancelRun };
