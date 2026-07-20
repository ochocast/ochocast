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

install_docker() {
  if command -v docker >/dev/null 2>&1; then
    return
  fi

  if command -v apt-get >/dev/null 2>&1; then
    export DEBIAN_FRONTEND=noninteractive
    apt-get update
    apt-get install -y ca-certificates curl docker.io
    systemctl enable --now docker
    return
  fi

  if command -v apk >/dev/null 2>&1; then
    apk add --no-cache docker
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

docker pull "$IMAGE"
docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
docker run \
  --detach \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  --network host \
  "$IMAGE"
