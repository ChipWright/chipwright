# Virtual Device Simulator

Digital-twin engine that runs the same SDK and HAL as physical firmware (branch 5,
Phase 2). Instead of a chip, the twin is driven by a simulated signal source, and a
fault model is interposed at the HAL seam so scenarios can be exercised without
hardware.

## What works today

- Simulated scalar signal source (`cw_sim_source_t`)
- Sensor fault injection: none, stuck (frozen reading), fail (I/O error), and offset
  (calibration drift), changeable mid-run
- Telemetry capture through the twin runtime for observation and assertion
- Network fault injection: commissioning and telemetry uplink run over the protocol
  layer's lossy transport, so the twin can survive injected packet loss end to end

## Layout

- `include/chipwright/sim.h` — simulator API
- `src/` — signal source, fault injection, twin runtime
- `tests/` — unit tests for source, faults, and capture
- `examples/thermostat_twin/` — runs the thermostat twin through several fault scenarios

## Running

The simulator links against the firmware SDK sources directly, so no code generation is
required:

```sh
make -C simulator test
make -C simulator example
```

## Not yet implemented

Battery-drain modelling and a richer virtual network fabric (multi-device topology,
latency, outages beyond uniform packet loss). Real protocol behavior arrives when the
protocol layer is backed by connectedhomeip.
