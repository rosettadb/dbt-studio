#!/usr/bin/env bash
set -euo pipefail

: "${GIT_URL:?GIT_URL env var required}"
: "${BRANCH:?BRANCH env var required}"

git clone --depth 1 --branch "$BRANCH" "$GIT_URL" /app
cd /app
echo "COMMIT_SHA=$(git rev-parse HEAD)"

# Never keep the credentialed remote URL around once cloned.
git remote set-url origin "$(git remote get-url origin | sed -E 's#https://[^@]+@#https://#')"

npm ci
npx playwright install --with-deps chromium

NODE_ENV=development npm run prestart

NODE_ENV=production SKIP_NOTARIZATION=true npm run build:renderer

mkdir -p .erb/renderer
cp -R release/app/dist/renderer/* .erb/renderer/

# windows/main/index.ts and windows/setup/index.ts load the preload script
# from .erb/dll/preload.js in dev mode, but webpack's [name].bundle.dev.js
# output naming actually produces preload.bundle.dev.js. Without this copy,
# the preload script silently fails to load, ipcRenderer is never exposed,
# and the renderer's React root never mounts anything (waits forever on
# IPC calls that can't be made).
cp .erb/dll/preload.bundle.dev.js .erb/dll/preload.js

Xvfb :99 -screen 0 1920x1080x24 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true' EXIT
sleep 2

export DISPLAY=:99
export CI=true
export ELECTRON_NO_UPDATER=1
export DISABLE_ANALYTICS=1
export ELECTRON_DISABLE_GPU=1
export SKIP_NOTARIZATION=true

# The app's secure-storage service uses `keytar`, which needs a real D-Bus
# Secret Service to talk to — without one it hangs forever (no error) the
# instant it's imported, which blocks the splash window from ever being
# created. gnome-keyring provides a disposable one for this container.
dbus-run-session -- bash -c '
  eval "$(printf "\n" | gnome-keyring-daemon --unlock --components=secrets)"
  export GNOME_KEYRING_CONTROL GNOME_KEYRING_PID
  npm run test:e2e
'
