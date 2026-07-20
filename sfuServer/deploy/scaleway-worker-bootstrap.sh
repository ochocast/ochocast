#!/usr/bin/env bash
set -euo pipefail

: "${SFU_IMAGE_TAG:?SFU_IMAGE_TAG must be set to an immutable image tag}"

if [ "$SFU_IMAGE_TAG" = "latest" ]; then
  echo "Refusing to start mutable SFU image tag: latest" >&2
  exit 1
fi

REGISTRY="${SFU_REGISTRY:-rg.fr-par.scw.cloud/sfu-server}"
IMAGE="${REGISTRY}/sfu:${SFU_IMAGE_TAG}"
CONTAINER_NAME="${SFU_CONTAINER_NAME:-ochocast-sfu-worker}"
SFU_PORT="${SFU_PORT:-8090}"
ICE_RELAY_ONLY="${ICE_RELAY_ONLY:-true}"
STUN_SERVERS="${STUN_SERVERS:-stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302}"

require_env() {
  name="$1"
  if [ -z "${!name:-}" ]; then
    echo "$name must be set by generated worker runtime values" >&2
    exit 1
  fi
}

detect_public_ip() {
  if [ -n "${PUBLIC_IP:-}" ]; then
    return
  fi

  # PUBLIC_IP in the legacy key/value response is now a shell-quoted table
  # when an Instance uses the multi-IP network stack. Consume the structured
  # metadata response instead and select the first public IPv4 address.
  if command -v curl >/dev/null 2>&1 && command -v jq >/dev/null 2>&1; then
    PUBLIC_IP="$(
      curl -fsS --max-time 5 'http://169.254.42.42/conf?format=json' 2>/dev/null \
        | jq -r '.public_ips_v4[0].address // .public_ip.address // empty' \
        || true
    )"
  fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl docker.io jq
    systemctl enable --now docker
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache ca-certificates curl docker jq
    rc-update add docker default || true
    service docker start || true
    return
  fi

  echo "No supported package manager found to install Docker" >&2
  exit 1
}

registry_login() {
  if [ -n "${SFU_REGISTRY_USERNAME:-}" ] && [ -n "${SFU_REGISTRY_PASSWORD:-}" ]; then
    printf '%s' "$SFU_REGISTRY_PASSWORD" | docker login "$REGISTRY" --username "$SFU_REGISTRY_USERNAME" --password-stdin
  fi
}

install_docker
registry_login

detect_public_ip
require_env SFU_ID
require_env PUBLIC_IP
require_env CONTROL_PLANE_URL

SERVER_URL="${SERVER_URL:-http://${PUBLIC_IP}:${SFU_PORT}}"

if [ "$ICE_RELAY_ONLY" = "true" ]; then
  require_env TURN_SERVER
  require_env TURN_USERNAME
  require_env TURN_PASSWORD
fi

docker pull "$IMAGE"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run \
  --detach \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  -e SFU_ID="$SFU_ID" \
  -e SERVER_URL="$SERVER_URL" \
  -e PUBLIC_IP="$PUBLIC_IP" \
  -e CONTROL_PLANE_URL="$CONTROL_PLANE_URL" \
  -e STUN_SERVERS="$STUN_SERVERS" \
  -e TURN_SERVER="${TURN_SERVER:-}" \
  -e TURN_USERNAME="${TURN_USERNAME:-}" \
  -e TURN_PASSWORD="${TURN_PASSWORD:-}" \
  -e ICE_RELAY_ONLY="$ICE_RELAY_ONLY" \
  -e ENABLE_ICE_TCP="${ENABLE_ICE_TCP:-false}" \
  -e SERVER_PORT="$SFU_PORT" \
  "$IMAGE"
