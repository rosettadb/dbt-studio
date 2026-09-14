const path = require('path');
const fs = require('fs');
const { Writable } = require('stream');
const Docker = require('dockerode');
const tar = require('tar-fs');

const db = require('./db');
const { authenticatedUrl, redact } = require('./git');
const { appendLog, emitStatus } = require('./logBus');

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const TEST_RUNNER_IMAGE =
  process.env.TEST_RUNNER_IMAGE || 'e2e-test-runner:latest';
const NPM_CACHE_VOLUME = 'e2e-runner-npm-cache';
const PLAYWRIGHT_CACHE_VOLUME = 'e2e-runner-playwright-cache';

// Memory and MemoryReservation set to the same value give the container a
// fixed allocation up front instead of growing it on demand, which is
// otherwise a real source of slowness under Docker's dynamic memory
// accounting.
const TEST_CONTAINER_MEMORY_MB = Math.max(
  512,
  Number(process.env.TEST_CONTAINER_MEMORY_MB) || 4096,
);
const TEST_CONTAINER_MEMORY_BYTES = TEST_CONTAINER_MEMORY_MB * 1024 * 1024;

const activeContainers = new Map(); // runId -> dockerode container
const cancelledRuns = new Set();

/**
 * Stops a run's container if it's currently active. The run's final
 * "cancelled" status is written by {@link executeRun}, once the container
 * actually exits.
 *
 * @param {number} runId Run to stop.
 * @returns {Promise<boolean>} False if the run has no active container
 *   (already finished, or never started — try `queue.cancelQueued` for that
 *   case instead).
 */
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

/**
 * Returns the per-run artifact directory (output.log and the extracted HTML
 * report), creating it if needed.
 *
 * @param {number} runId Run the directory belongs to.
 * @returns {string} Absolute path to the run's directory.
 */
function runDir(runId) {
  const dir = path.join(db.dataDir, 'runs', String(runId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Splits arbitrary chunked output into whole lines and forwards each one.
 * Any trailing partial line is flushed when the stream ends.
 *
 * @param {(line: string) => void} onLine Called once per complete line,
 *   without the newline.
 * @returns {import('stream').Writable} Stream to pipe container output into.
 */
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

/**
 * Copies /app/test-results out of the finished container into `dir/report`, so
 * the Playwright HTML report outlives the container. Never throws: a missing
 * archive is logged and treated as a normal outcome.
 *
 * @param {number} runId Run the container belongs to, for logging.
 * @param {object} container Dockerode container.
 * @param {string} dir The run's artifact directory.
 * @returns {Promise<void>}
 */
async function extractReport(runId, container, dir) {
  const reportDir = path.join(dir, 'report');
  fs.mkdirSync(reportDir, { recursive: true });
  try {
    const archiveStream = await container.getArchive({
      path: '/app/test-results',
    });
    await new Promise((resolve, reject) => {
      archiveStream
        .pipe(tar.extract(reportDir, { strip: 1 }))
        .on('finish', resolve)
        .on('error', reject);
    });
  } catch (err) {
    // Container may exit before producing any test-results (e.g. build
    // failure) — that's a normal outcome, not a runner bug.
    appendLog(
      runId,
      `[runner] no test-results archive to collect: ${err.message}`,
    );
  }
}

/**
 * Runs one run end to end: starts the test container for its branch, streams
 * the output to the log bus and to disk, collects the report, then records the
 * terminal status ("passed", "failed", "cancelled" or "error"). The container
 * is always removed, and errors are recorded rather than rethrown, so the
 * queue keeps draining.
 *
 * @param {object} run The run row to execute; needs `id` and `branch`.
 * @returns {Promise<void>} Resolves once the run has reached a terminal status.
 */
async function executeRun(run) {
  const runId = run.id;
  const dir = runDir(runId);
  const logStream = fs.createWriteStream(path.join(dir, 'output.log'), {
    flags: 'a',
  });

  const log = (line) => {
    const commitMatch = /^COMMIT_SHA=([0-9a-f]{7,40})$/.exec(line.trim());
    if (commitMatch) db.updateRun(runId, { commit_sha: commitMatch[1] });
    appendLog(runId, line);
    logStream.write(`${line}\n`);
  };

  db.updateRun(runId, {
    status: 'running',
    started_at: new Date().toISOString(),
  });
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
        Memory: TEST_CONTAINER_MEMORY_BYTES,
        MemoryReservation: TEST_CONTAINER_MEMORY_BYTES,
      },
    });
    activeContainers.set(runId, container);

    const attachStream = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    const stdoutSplitter = lineSplitter((line) => log(redact(line)));
    const stderrSplitter = lineSplitter((line) => log(redact(line)));
    container.modem.demuxStream(attachStream, stdoutSplitter, stderrSplitter);

    await container.start();

    const waitResult = await container.wait();
    const exitCode = waitResult.StatusCode;

    await extractReport(runId, container, dir);

    const wasCancelled = cancelledRuns.delete(runId);
    let status = 'failed';
    if (wasCancelled) {
      status = 'cancelled';
    } else if (exitCode === 0) {
      status = 'passed';
    }
    db.updateRun(runId, {
      status,
      exit_code: exitCode,
      finished_at: new Date().toISOString(),
    });
    emitStatus(runId, status);
    log(
      `[runner] run ${wasCancelled ? 'cancelled' : `finished with exit code ${exitCode}`}`,
    );
  } catch (err) {
    log(`[runner] error: ${redact(err.message)}`);
    db.updateRun(runId, {
      status: 'error',
      finished_at: new Date().toISOString(),
    });
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
