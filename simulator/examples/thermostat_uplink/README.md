# Thermostat cloud uplink

Demonstrates the full device-to-cloud telemetry path with the real firmware and the real
cloud:

```
C firmware (NDJSON on stdout) -> bridge (Node) -> cloud HTTP ingest -> device shadow
```

The firmware emits each telemetry sample as a line of NDJSON. The bridge
(`cloud/src/bridge/uplink.ts`) reads those lines, registers the device once, and posts
each sample to the cloud, which updates the device shadow. No network stack is embedded in
the C firmware; the bridge is the seam.

## Running

From the repository root:

```sh
sh simulator/examples/thermostat_uplink/run-end-to-end.sh
```

The script builds the firmware, starts the cloud, streams telemetry through the bridge,
and prints the device shadow, which should show the last reported temperature.

The bridge itself is covered deterministically in CI by `cloud/test/bridge.test.ts`, which
feeds NDJSON through the bridge into an in-process cloud server.
