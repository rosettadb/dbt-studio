// Electron E2E tests already run with workers: 1 (playwright.config.ts) —
// today's server can only usefully run one browser+Electron instance at a
// time. MAX_CONCURRENT_RUNS lets that cap move with you to bigger hardware
// without any code changes.

const MAX_CONCURRENT_RUNS = Math.max(1, Number(process.env.MAX_CONCURRENT_RUNS) || 1);

const pending = [];
let active = 0;

function enqueue(job) {
  pending.push(job);
  drain();
}

async function drain() {
  if (active >= MAX_CONCURRENT_RUNS) return;
  const job = pending.shift();
  if (!job) return;
  active += 1;
  try {
    await job();
  } finally {
    active -= 1;
    drain();
  }
}

module.exports = { enqueue, MAX_CONCURRENT_RUNS };
