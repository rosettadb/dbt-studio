const branchSelect = document.getElementById('branch-select');
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

const TERMINAL_STATUSES = ['passed', 'failed', 'error', 'cancelled'];
const ACTIVE_STATUSES = ['queued', 'running'];

async function cancelRun(id) {
  await fetch(`/api/runs/${id}/cancel`, { method: 'POST' });
  loadHistory();
}

async function loadBranches() {
  const res = await fetch('/api/branches');
  const data = await res.json();
  if (!res.ok) {
    branchSelect.innerHTML = `<option>Failed to load branches</option>`;
    return;
  }
  branchSelect.innerHTML = data.branches
    .map((b) => `<option value="${b}">${b}</option>`)
    .join('');
  runBtn.disabled = false;
}

function setStatusBadge(el, status) {
  el.textContent = status;
  el.className = `badge ${status}`;
}

function formatDuration(run) {
  if (!run.started_at) return '—';
  const end = run.finished_at ? new Date(run.finished_at) : new Date();
  const seconds = Math.round((end - new Date(run.started_at)) / 1000);
  return `${seconds}s`;
}

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

function watchRun(run) {
  if (currentStream) currentStream.close();

  currentRunId = run.id;
  live.classList.remove('hidden');
  liveId.textContent = run.id;
  liveBranch.textContent = run.branch;
  liveLog.textContent = '';
  liveReport.classList.add('hidden');
  liveStop.classList.toggle('hidden', !ACTIVE_STATUSES.includes(run.status));
  setStatusBadge(liveStatus, run.status);

  const stream = new EventSource(`/api/runs/${run.id}/stream`);
  currentStream = stream;

  stream.addEventListener('log', (e) => {
    liveLog.textContent += `${JSON.parse(e.data)}\n`;
    liveLog.scrollTop = liveLog.scrollHeight;
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

liveStop.addEventListener('click', () => {
  if (currentRunId) cancelRun(currentRunId);
});

runBtn.addEventListener('click', async () => {
  const branch = branchSelect.value;
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
