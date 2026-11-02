#!/bin/sh
# Builds and starts the backend against the POC stack. Ctrl-C flushes telemetry.
set -eu
cd "$(dirname "$0")/../../backend"
npm run build
exec node --env-file=../dev-tools/observability/backend.env dist/main.js
