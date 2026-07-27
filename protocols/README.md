# Protocol Integration Layer

Maps DDL capabilities onto protocol constructs and handles commissioning (branch 4,
Phase 2). Matter is the primary target; Thread, Bluetooth LE, WiFi, and legacy adapters
(Zigbee, Z-Wave, MQTT, REST) follow.

## What works today

- Simulated network transport with deterministic, seedable packet loss
  (`cw_sim_transport_t`)
- Simulated Matter commissioning that retries per step over a lossy link, so a device
  survives packet loss or fails cleanly when the link is dead
- Capability to Matter cluster mapping (for example `temperature_sensor` maps to the
  TemperatureMeasurement cluster's MeasuredValue attribute)

## Layout

- `include/chipwright/protocol.h` — protocol API
- `src/transport_sim.c` — simulated lossy transport
- `src/matter.c` — commissioning and cluster mapping
- `tests/` — unit tests, with packet loss seeded for determinism
- `examples/commission_thermostat/` — commissioning under packet loss

## Running

```sh
make -C protocols test
make -C protocols example
```

## Not yet implemented

- Real Matter via connectedhomeip. The MVP models commissioning and cluster mapping in a
  simulated transport so the logic is host-verifiable; backing these interfaces with the
  upstream stack requires that toolchain and hardware, deferred on the same basis as the
  ESP32 BSP.
- Thread, Bluetooth LE, WiFi, and legacy adapters.
- Generating the capability to cluster mapping from the manifest via a device-engine
  generator, rather than the hand-written table used today.
