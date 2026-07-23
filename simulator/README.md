# Virtual Device Simulator

Digital-twin engine that runs the same SDK and HAL as physical firmware (branch 5,
Phase 2). Instead of a chip, the twin is driven by a simulated signal source, and a
fault model is interposed at the HAL seam so scenarios can be exercised without
hardware.

## What works today

- Simulated scalar signal source (`oh_sim_source_t`)
- Sensor fault injection: none, stuck (frozen reading), fail (I/O error), and offset
  (calibration drift), changeable mid-run
- Telemetry capture through the twin runtime for observation and assertion

## Layout

- `include/openhome/sim.h` — simulator API
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

Network fault injection (packet loss, outages) and protocol behavior depend on the
protocol layer (branch 4), which is the next Phase 2 branch. Battery-drain modelling and
a virtual network fabric follow from there.
