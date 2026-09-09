// Electron E2E tests already run with workers: 1 (playwright.config.ts) —
// the host can only usefully run one browser+Electron instance at a time,
// so the queue mirrors that and processes one run at a time.

const pending = [];
let processing = false;

function enqueue(job) {
  pending.push(job);
  drain();
}

async function drain() {
  if (processing) return;
  const job = pending.shift();
  if (!job) return;
  processing = true;
  try {
    await job();
  } finally {
    processing = false;
    drain();
  }
}

module.exports = { enqueue };
