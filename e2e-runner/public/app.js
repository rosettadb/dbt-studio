const branchSelect = document.getElementById('branch-select');
const runBtn = document.getElementById('run-btn');
const live = document.getElementById('live');
const liveId = document.getElementById('live-id');
const liveBranch = document.getElementById('live-branch');
const liveStatus = document.getElementById('live-status');
const liveLog = document.getElementById('live-log');
const liveReport = document.getElementById('live-report');
const historyBody = document.querySelector('#history tbody');

let currentStream = null;

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
      </tr>`,
    )
    .join('');
}

function watchRun(run) {
  if (currentStream) currentStream.close();

  live.classList.remove('hidden');
  liveId.textContent = run.id;
  liveBranch.textContent = run.branch;
  liveLog.textContent = '';
  liveReport.classList.add('hidden');
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
    if (['passed', 'failed', 'error'].includes(status)) {
      liveReport.href = `/api/runs/${run.id}/report/`;
      liveReport.classList.remove('hidden');
      loadHistory();
    }
  });
}

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
