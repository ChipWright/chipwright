# Firmware SDK

Device SDK and Hardware Abstraction Layer (HAL) for OpenHome Studio (branches 2 and 3,
Phase 1). Provides the runtime that generated firmware interfaces build against:
lifecycle, logging, telemetry, and capability traits (sensors and actuators) resolved
by a board support package (BSP).

## Layout

- `include/openhome/sdk.h` — status codes, logging, telemetry, device lifecycle
- `include/openhome/hal.h` — sensor and actuator traits and the driver registry
- `src/` — SDK and HAL implementation
- `bsp/native/` — host BSP with simulated drivers (also the seam the simulator drives)
- `examples/thermostat/` — reference firmware built from the generated interface

## Building the reference firmware

The interface header is generated from the device manifest, so build the engine first:

```sh
pnpm --filter @openhome/device-engine build
cd sdk/firmware/examples/thermostat
make run
```

Expected output is the device initializing and emitting telemetry samples for the
temperature sensor, then applying an HVAC mode. This exercises the full Phase 1 path:
manifest -> generated interface -> SDK + HAL -> a binary that logs telemetry.
