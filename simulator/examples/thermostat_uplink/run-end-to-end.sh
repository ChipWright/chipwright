#!/bin/sh
# End-to-end device-to-cloud demonstration. Starts the cloud, pipes the C firmware's
# NDJSON telemetry through the bridge into the cloud, then reads the device shadow back.
#
# Run from the repository root:
#   sh simulator/examples/thermostat_uplink/run-end-to-end.sh

set -e

REPO="$(cd "$(dirname "$0")/../../.." && pwd)"
PORT=8137
BASE="http://127.0.0.1:${PORT}"

echo "building firmware uplink"
make -C "${REPO}/simulator/examples/thermostat_uplink" >/dev/null

echo "starting cloud on port ${PORT}"
PORT="${PORT}" pnpm --filter @chipwright/cloud serve >/tmp/chipwright-cloud.log 2>&1 &
CLOUD_PID=$!
trap 'kill "${CLOUD_PID}" 2>/dev/null || true' EXIT

# Wait for the cloud to accept connections.
i=0
until curl -s -o /dev/null "${BASE}/devices"; do
  i=$((i + 1))
  if [ "${i}" -gt 50 ]; then
    echo "cloud did not start" >&2
    exit 1
  fi
  sleep 0.1
done

echo "streaming telemetry: firmware -> bridge -> cloud"
"${REPO}/simulator/examples/thermostat_uplink/build/thermostat_uplink" \
  | CLOUD_BASE="${BASE}" DEVICE_ID=smart_thermostat DEVICE_TYPE=thermostat \
    pnpm --filter @chipwright/cloud exec tsx src/bridge/uplink.ts

echo "device shadow after uplink:"
curl -s "${BASE}/devices/smart_thermostat/shadow"
echo
