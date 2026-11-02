#!/usr/bin/env bash
# Generates realistic traffic against the local backend so every dashboard,
# trace and alert of the POC has data:
#   - a full multipart upload (create, sign, PUT to S3, complete) -> P1 parcours
#   - catalogue reads
#   - a recording start that fails (no control-plane locally)   -> error path
#   - a 404 and a 401                                           -> warn lines
#
# Usage: ./scenario.sh [iterations]   (default 1)
set -euo pipefail

API=${API:-http://localhost:3001/api}
KEYCLOAK=${KEYCLOAK:-http://localhost:8080}
ITERATIONS=${1:-1}
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

token() {
  curl -fsS "$KEYCLOAK/realms/local-realm/protocol/openid-connect/token" \
    -d grant_type=password -d client_id=ochocast \
    -d username=test-user -d password=test-password | jq -r .access_token
}

TOKEN=$(token)
AUTH=(-H "Authorization: Bearer $TOKEN")

# Creates the user row on first login.
curl -fsS "${AUTH[@]}" "$API/users/login" >/dev/null

upload() {
  local file="$WORK/video.mp4" size checksum id sign url
  head -c $((512 * 1024 + RANDOM)) /dev/urandom >"$file"
  size=$(stat -c %s "$file")
  checksum=$(openssl dgst -sha256 -binary "$file" | base64)

  id=$(curl -fsS "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"filename\":\"demo.mp4\",\"size\":$size}" "$API/video-uploads" | jq -r .id)
  sign=$(curl -fsS "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d "{\"checksum\":\"$checksum\"}" "$API/video-uploads/$id/parts/1")
  url=$(jq -r .url <<<"$sign")
  curl -fsS -X PUT -H "x-amz-checksum-sha256: $checksum" \
    --data-binary @"$file" "$url" >/dev/null
  curl -fsS "${AUTH[@]}" -F "title=POC upload $(date +%T)" \
    "$API/video-uploads/$id/complete" >/dev/null
  echo "upload $id completed"
}

for i in $(seq 1 "$ITERATIONS"); do
  echo "--- iteration $i/$ITERATIONS"
  upload
  curl -fsS "$API/videos" >/dev/null && echo "catalogue read"
  code=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" -H 'Content-Type: application/json' \
    -d '{"trackId":"poc-track","roomId":"poc-room","roomKey":"not-logged","sfuUrl":"http://sfu.local"}' \
    "$API/recordings/start")
  echo "recording start -> $code (expected 500: no control-plane locally)"
  code=$(curl -s -o /dev/null -w '%{http_code}' "${AUTH[@]}" "$API/video-uploads/$(cat /proc/sys/kernel/random/uuid)")
  echo "unknown upload -> $code"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$API/users/favorites")
  echo "no token -> $code"
done
