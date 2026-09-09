// Electron E2E tests already run with workers: 1 (playwright.config.ts) —
// today's server can only usefully run one browser+Electron instance at a
// time. MAX_CONCURRENT_RUNS lets that cap move with you to bigger hardware
// without any code changes.

const MAX_CONCURRENT_RUNS = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS) || 1);

const pending = []; // { id, job }
let active = 0;

function enqueue(id, job) {
  pending.push({ id, job });
  drain();
}

// Removes a job that hasn't started yet. Returns true if it was found and
// removed — false means it's already running (or finished), and the caller
// needs to stop it a different way.
function cancelQueued(id) {
  const index = pending.findIndex((entry) => entry.id === id);
  if (index === -1) return false;
  pending.splice(index, 1);
  return true;
}

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

module.exports = { enqueue, cancelQueued, MAX_CONCURRENT_RUNS };
