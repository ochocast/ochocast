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
LOG_SHIPPER_IMAGE="docker.io/grafana/alloy:v1.21.3"
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

# Pushes the logs of the worker's containers (SFU, recorder) to Loki when
# credentials were provided. Logs are best-effort: a failure here must not
# prevent the worker from serving.
start_log_shipper() {
  if [ -z "${LOKI_URL:-}" ]; then
    return
  fi

  mkdir -p /etc/alloy
  cat > /etc/alloy/config.alloy <<'ALLOY'
discovery.docker "local" {
  host = "unix:///var/run/docker.sock"
}

// One stream per container, named after it (ochocast-sfu-worker, ...).
discovery.relabel "containers" {
  targets = discovery.docker.local.targets

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/ochocast-log-shipper"
    action        = "drop"
  }
  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "service_name"
  }
}

loki.source.docker "containers" {
  host    = "unix:///var/run/docker.sock"
  targets = discovery.relabel.containers.output
  labels  = {
    deployment_environment_name = sys.env("DEPLOYMENT_ENVIRONMENT"),
  }
  forward_to = [loki.process.sfu.receiver]
}

// Worker IDs are unbounded over time: structured metadata, not a label.
loki.process "sfu" {
  stage.template {
    source   = "sfu_id"
    template = sys.env("SFU_ID")
  }
  stage.structured_metadata {
    values = { sfu_id = "" }
  }
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = sys.env("LOKI_URL")

    basic_auth {
      username = sys.env("LOKI_USERNAME")
      password = sys.env("LOKI_PASSWORD")
    }
  }
}
ALLOY

  docker rm -f ochocast-log-shipper >/dev/null 2>&1 || true
  docker run \
    --detach \
    --name ochocast-log-shipper \
    --restart unless-stopped \
    -v /var/run/docker.sock:/var/run/docker.sock:ro \
    -v /etc/alloy/config.alloy:/etc/alloy/config.alloy:ro \
    -e SFU_ID="$SFU_ID" \
    -e DEPLOYMENT_ENVIRONMENT="${DEPLOYMENT_ENVIRONMENT:-}" \
    -e LOKI_URL="$LOKI_URL" \
    -e LOKI_USERNAME="${LOKI_USERNAME:-}" \
    -e LOKI_PASSWORD="${LOKI_PASSWORD:-}" \
    "$LOG_SHIPPER_IMAGE" run /etc/alloy/config.alloy
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
  -e ICE_UDP_PORT_MIN="${ICE_UDP_PORT_MIN:-}" \
  -e ICE_UDP_PORT_MAX="${ICE_UDP_PORT_MAX:-}" \
  -e SERVER_PORT="$SFU_PORT" \
  "$IMAGE"

start_log_shipper || echo "Log shipper failed to start; the SFU keeps running" >&2
