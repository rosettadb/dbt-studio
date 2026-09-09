const { execFile } = require('child_process');

function authenticatedUrl() {
  const { GIT_REPO_URL, GIT_USERNAME, GIT_TOKEN } = process.env;
  if (!GIT_REPO_URL || !GIT_USERNAME || !GIT_TOKEN) {
    throw new Error('GIT_REPO_URL, GIT_USERNAME and GIT_TOKEN must be set');
  }
  const url = new URL(GIT_REPO_URL);
  url.username = GIT_USERNAME;
  url.password = GIT_TOKEN;
  return url.toString();
}

// Redacts the token so it never ends up in logs or error responses.
function redact(text) {
  const { GIT_TOKEN } = process.env;
  if (!GIT_TOKEN) return text;
  return text.split(GIT_TOKEN).join('***');
}

function listBranches() {
  return new Promise((resolve, reject) => {
    execFile(
      'git',
      ['ls-remote', '--heads', authenticatedUrl()],
      { timeout: 20000 },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(redact(stderr || err.message)));
          return;
        }
        const branches = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => line.split('refs/heads/')[1])
          .filter(Boolean)
          .sort();
        resolve(branches);
      },
    );
  });
}

module.exports = { authenticatedUrl, redact, listBranches };
