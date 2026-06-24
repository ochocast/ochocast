#!/bin/sh
set -eu

/opt/keycloak/bin/kc.sh start-dev --import-realm &
keycloak_pid=$!

stop_keycloak() {
  kill -TERM "$keycloak_pid" 2>/dev/null || true
  wait "$keycloak_pid" 2>/dev/null || true
}

trap stop_keycloak INT TERM

until /opt/keycloak/bin/kcadm.sh config credentials \
  --server http://localhost:8080 \
  --realm master \
  --user "${KEYCLOAK_ADMIN}" \
  --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; do
  if ! kill -0 "$keycloak_pid" 2>/dev/null; then
    wait "$keycloak_pid"
    exit $?
  fi
  sleep 1
done

/opt/keycloak/bin/kcadm.sh update realms/master -s sslRequired=NONE
/opt/keycloak/bin/kcadm.sh update realms/local-realm -s sslRequired=NONE

wait "$keycloak_pid"
