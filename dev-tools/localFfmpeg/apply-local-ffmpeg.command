#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")"
exec node ./apply-local-ffmpeg.mjs "$@"
