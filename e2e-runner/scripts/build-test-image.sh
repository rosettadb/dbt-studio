#!/usr/bin/env bash
# Builds/updates the disposable per-run test image. Run this once, and again
# only when docker/test-runner.Dockerfile or test-entrypoint.sh change —
# app dependency changes do NOT require rebuilding this image.
set -euo pipefail
cd "$(dirname "$0")/.."

docker build -t e2e-test-runner:latest -f docker/test-runner.Dockerfile docker
