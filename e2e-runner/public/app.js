const branchSearch = document.getElementById('branch-search');
const branchDropdown = document.getElementById('branch-dropdown');
const branchCombobox = document.getElementById('branch-combobox');
const runBtn = document.getElementById('run-btn');
const live = document.getElementById('live');
const liveId = document.getElementById('live-id');
const liveBranch = document.getElementById('live-branch');
const liveStatus = document.getElementById('live-status');
const liveLog = document.getElementById('live-log');
const liveReport = document.getElementById('live-report');
const liveStop = document.getElementById('live-stop');
const historyBody = document.querySelector('#history tbody');

let currentStream = null;
let currentRunId = null;

// Full test runs can emit tens of thousands of lines (webpack, npm, the
// Playwright reporter) — unbounded appends to the DOM eventually exhaust
// the tab's memory on a long run. Keep only the most recent lines.
const MAX_LOG_LINES = 5000;
let logLines = [];

/**
 * Appends one line to the live log view, trimming to MAX_LOG_LINES, and keeps
 * the view scrolled to the bottom.
 *
 * @param {string} line Line of test output.
 */
function appendLogLine(line) {
  logLines.push(line);
  if (logLines.length > MAX_LOG_LINES) {
    logLines = logLines.slice(-MAX_LOG_LINES);
    liveLog.textContent = `${logLines.join('\n')}\n`;
  } else {
    liveLog.textContent += `${line}\n`;
  }
  liveLog.scrollTop = liveLog.scrollHeight;
}

const TERMINAL_STATUSES = ['passed', 'failed', 'error', 'cancelled'];
const ACTIVE_STATUSES = ['queued', 'running'];

/**
 * Formats how long a run took, counting up from `started_at` to now while the
 * run is still going.
 *
 * @param {object} run Run row.
 * @returns {string} Duration in seconds, or "—" if the run hasn't started.
 */
function formatDuration(run) {
  if (!run.started_at) return '—';
  const end = run.finished_at ? new Date(run.finished_at) : new Date();
  const seconds = Math.round((end - new Date(run.started_at)) / 1000);
  return `${seconds}s`;
}

/**
 * Redraws the run history table. Called on load, after actions that change a
 * run, and on a 5s interval so durations and statuses stay current.
 *
 * @returns {Promise<void>}
 */
async function loadHistory() {
  const res = await fetch('/api/runs');
  const { runs } = await res.json();
  historyBody.innerHTML = runs
    .map(
      (r) => `
      <tr>
        <td>${r.id}</td>
        <td>${r.branch}</td>
        <td>${r.commit_sha ? r.commit_sha.slice(0, 7) : '—'}</td>
        <td><span class="badge ${r.status}">${r.status}</span></td>
        <td>${r.started_at || '—'}</td>
        <td>${formatDuration(r)}</td>
        <td>
          <button class="link-btn" data-view-logs="${r.id}">Logs</button>
          ${
            TERMINAL_STATUSES.includes(r.status)
              ? `<a href="/api/runs/${r.id}/report/" target="_blank">Report</a>`
              : `<button class="link-btn danger" data-stop="${r.id}">Stop</button>`
          }
        </td>
      </tr>`,
    )
    .join('');
}

/**
 * Asks the server to cancel a run and refreshes the history table. The run's
 * new status also arrives over the SSE stream, so failures here are not
 * surfaced separately.
 *
 * @param {number|string} id Run to cancel.
 * @returns {Promise<void>}
 */
async function cancelRun(id) {
  await fetch(`/api/runs/${id}/cancel`, { method: 'POST' });
  loadHistory();
}

let allBranches = [];
let selectedBranch = null;

/**
 * Loads the remote's branches into `allBranches` and enables the picker. On
 * failure the input stays disabled and says so in its placeholder.
 *
 * @returns {Promise<void>}
 */
async function loadBranches() {
  const res = await fetch('/api/branches');
  const data = await res.json();
  if (!res.ok) {
    branchSearch.placeholder = 'Failed to load branches';
    return;
  }
  allBranches = data.branches;
  branchSearch.placeholder = 'Search branches…';
  branchSearch.disabled = false;
}

/**
 * Renders the branch dropdown, showing the first 50 case-insensitive substring
 * matches, and opens it.
 *
 * @param {string} filter Current search text; empty shows the unfiltered list.
 */
function renderBranchDropdown(filter) {
  const query = filter.trim().toLowerCase();
  const matches = (
    query
      ? allBranches.filter((b) => b.toLowerCase().includes(query))
      : allBranches
  ).slice(0, 50);

  if (matches.length === 0) {
    branchDropdown.innerHTML = `<div class="dropdown-empty">No matching branches</div>`;
  } else {
    branchDropdown.innerHTML = matches
      .map((b) => `<div class="dropdown-item" data-branch="${b}">${b}</div>`)
      .join('');
  }
  branchDropdown.classList.remove('hidden');
}

/**
 * Commits a branch choice: fills the input, closes the dropdown and enables
 * the run button. Typing again clears the selection.
 *
 * @param {string} branch Branch the user picked.
 */
function selectBranch(branch) {
  selectedBranch = branch;
  branchSearch.value = branch;
  branchDropdown.classList.add('hidden');
  runBtn.disabled = false;
}

branchSearch.addEventListener('focus', () =>
  renderBranchDropdown(branchSearch.value),
);
branchSearch.addEventListener('input', () => {
  selectedBranch = null;
  runBtn.disabled = true;
  renderBranchDropdown(branchSearch.value);
});

branchDropdown.addEventListener('click', (e) => {
  const { branch } = e.target.dataset;
  if (branch) selectBranch(branch);
});

document.addEventListener('click', (e) => {
  if (!branchCombobox.contains(e.target))
    branchDropdown.classList.add('hidden');
});

/**
 * Points a badge element at a run status, using the status as its CSS class.
 *
 * @param {HTMLElement} el Badge element to update.
 * @param {string} status Run status, e.g. "running" or "failed".
 */
function setStatusBadge(el, status) {
  el.textContent = status;
  el.className = `badge ${status}`;
}

/**
 * Shows the live panel for a run and subscribes to its SSE stream, replacing
 * whichever run was being watched before. The server replays past output, so
 * this works for finished runs too.
 *
 * @param {object} run Run row to watch; needs `id`, `branch` and `status`.
 */
function watchRun(run) {
  if (currentStream) currentStream.close();

  currentRunId = run.id;
  live.classList.remove('hidden');
  liveId.textContent = run.id;
  liveBranch.textContent = run.branch;
  logLines = [];
  liveLog.textContent = '';
  liveReport.classList.add('hidden');
  liveStop.classList.toggle('hidden', !ACTIVE_STATUSES.includes(run.status));
  setStatusBadge(liveStatus, run.status);

  const stream = new EventSource(`/api/runs/${run.id}/stream`);
  currentStream = stream;

  stream.addEventListener('log', (e) => {
    appendLogLine(JSON.parse(e.data));
  });

  stream.addEventListener('status', (e) => {
    const status = JSON.parse(e.data);
    setStatusBadge(liveStatus, status);
    liveStop.classList.toggle('hidden', !ACTIVE_STATUSES.includes(status));
    if (TERMINAL_STATUSES.includes(status)) {
      liveReport.href = `/api/runs/${run.id}/report/`;
      liveReport.classList.remove('hidden');
      loadHistory();
    }
  });
}

historyBody.addEventListener('click', async (e) => {
  const viewId = e.target.dataset.viewLogs;
  if (viewId) {
    const res = await fetch(`/api/runs/${viewId}`);
    const { run } = await res.json();
    watchRun(run);
    return;
  }
  const stopId = e.target.dataset.stop;
  if (stopId) cancelRun(stopId);
});

liveStop.addEventListener('click', () => {
  if (currentRunId) cancelRun(currentRunId);
});

runBtn.addEventListener('click', async () => {
  const branch = selectedBranch;
  if (!branch) return;
  runBtn.disabled = true;
  try {
    const res = await fetch('/api/runs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch }),
    });
    const { run } = await res.json();
    watchRun(run);
    loadHistory();
  } finally {
    runBtn.disabled = false;
  }
});

loadBranches();
loadHistory();
setInterval(loadHistory, 5000);
