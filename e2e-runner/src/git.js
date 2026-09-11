const { execFile } = require('child_process');

/**
 * Builds the repository clone URL with credentials embedded, for git commands
 * and for the test container's GIT_URL. The result contains the token, so pass
 * it through {@link redact} before putting it in a log or an error response.
 *
 * @returns {string} GIT_REPO_URL with GIT_USERNAME and GIT_TOKEN embedded.
 * @throws {Error} If any of those three environment variables is missing.
 */
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

/**
 * Redacts the token so it never ends up in logs or error responses.
 *
 * @param {string} text Text that may contain GIT_TOKEN.
 * @returns {string} The text with every occurrence of the token replaced by "***".
 */
function redact(text) {
  const { GIT_TOKEN } = process.env;
  if (!GIT_TOKEN) return text;
  return text.split(GIT_TOKEN).join('***');
}

/**
 * Lists the remote's branch names via `git ls-remote`, for the branch picker.
 * Nothing is cloned, so this stays cheap enough to call on page load.
 *
 * @returns {Promise<string[]>} Branch names, sorted alphabetically.
 * @throws {Error} If git fails or times out; the message is redacted.
 */
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
