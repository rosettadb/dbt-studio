// Electron E2E tests already run with workers: 1 (playwright.config.ts) —
// today's server can only usefully run one browser+Electron instance at a
// time. MAX_CONCURRENT_RUNS lets that cap move with you to bigger hardware
// without any code changes.

const MAX_CONCURRENT_RUNS = Math.max(
  1,
  Number(process.env.MAX_CONCURRENT_RUNS) || 1,
);

const pending = []; // { id, job }
let active = 0;

/**
 * Removes a job that hasn't started yet.
 *
 * @param {number} id Run id to drop from the queue.
 * @returns {boolean} True if the job was found and removed. False means it's
 *   already running (or finished), and the caller needs to stop it a different
 *   way — see `cancelRun` in runner.js.
 */
function cancelQueued(id) {
  const index = pending.findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  pending.splice(index, 1);
  return true;
}

/**
 * Starts the next queued job if we're under MAX_CONCURRENT_RUNS, then calls
 * itself once that job settles so the queue keeps moving. A job that throws is
 * swallowed here; `executeRun` is expected to record its own failures.
 *
 * @returns {Promise<void>} Resolves when this invocation's job has settled.
 */
async function drain() {
  if (active >= MAX_CONCURRENT_RUNS) return;
  const entry = pending.shift();
  if (!entry) return;
  active += 1;
  try {
    await entry.job();
  } finally {
    active -= 1;
    drain();
  }
}

/**
 * Queues a run's job and starts it if a concurrency slot is free. Returns
 * immediately — the job itself is awaited by {@link drain}, not by the caller.
 *
 * @param {number} id Run id, used by {@link cancelQueued} to find the job again.
 * @param {() => Promise<void>} job Work to run when a slot frees up.
 */
function enqueue(id, job) {
  pending.push({ id, job });
  drain();
}

module.exports = { enqueue, cancelQueued, MAX_CONCURRENT_RUNS };
