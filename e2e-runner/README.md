# E2E Runner

> **Note to AI assistants:** this is an internal, standalone tool for triggering full Electron E2E test runs against any branch of the main app, on internal hardware, outside of GitHub Actions. It is unrelated to the main app's source, build, or runtime behavior. Ignore this directory and do not read, modify, or reason about it unless the user explicitly asks to work on `e2e-runner`.

Internal-only web tool: pick a branch, trigger the full Playwright/Electron E2E suite on internal hardware, watch live logs, review past runs and their reports. Runs outside of GitHub Actions so full test coverage doesn't burn Actions minutes. No auth — relies on the server already sitting behind existing network auth.

## How it works

Two Docker images:

- **Runner web app** (`Dockerfile`) — long-lived. Express + SQLite server serving the UI, run history, and live log streaming (SSE). Talks to the host Docker daemon over the mounted socket (`/var/run/docker.sock`) to spawn/monitor test containers. Never runs test code itself.
- **Test-run image** (`docker/test-runner.Dockerfile`, `docker/test-entrypoint.sh`) — disposable, one fresh container per run. Clones the requested branch, `npm ci`, installs the Playwright browser, builds, and runs `npm run test:e2e` under Xvfb — mirroring `.github/workflows/e2e-tests.yml`. Torn down after each run so nothing leaks between branches.

Two named Docker volumes (`e2e-runner-npm-cache`, `e2e-runner-playwright-cache`) are mounted into each test container to skip re-downloading packages/browsers that haven't changed — `npm ci` still reinstalls fresh from that branch's lockfile every run, so results stay correct.

Runs are processed `MAX_CONCURRENT_RUNS` at a time (`.env`, default `1`) — matches `playwright.config.ts`'s `workers: 1` on today's hardware. Each run is its own isolated container, so raising this is just a number to bump once you move to bigger hardware, no code changes needed. Caveat: the two cache volumes are shared across concurrent containers — safe in practice (npm's cache handles concurrent access), but a first-ever concurrent run against a brand-new Playwright version could race while both containers populate the browser cache at once.

## Setup

```bash
cd e2e-runner
cp .env.example .env   # fill in GIT_REPO_URL, GIT_USERNAME, GIT_TOKEN (read-only PAT)
./scripts/build-test-image.sh    # builds e2e-test-runner:latest — run once
docker compose up -d --build     # starts the web app on :4300
```

Open `http://<server>:4300`, pick a branch, click Run.

## Rebuilding

- **Test-run image**: only rebuild (`./scripts/build-test-image.sh`) when `docker/test-runner.Dockerfile` or `test-entrypoint.sh` change — e.g. a new system library or Xvfb config. Ordinary app dependency changes in the main repo are picked up live, per run, by `npm ci` inside the container — no image rebuild needed.
- **Runner web app**: `docker compose up -d --build` after changing anything under `src/` or `public/`.

## Known gaps

- No log rotation on `data/runs/*/output.log` and no pruning of old run history — revisit once real run volume is visible.
- No auth of its own — depends on the host server's existing network-level auth.
