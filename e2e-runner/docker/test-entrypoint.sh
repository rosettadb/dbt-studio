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

npm run test:e2e
