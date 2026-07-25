# Testing and Hardware-in-the-Loop

Automated testing framework (branches 6 and 7, Phase 3). Suites are written once against
an abstract device target and run identically on the digital twin today and on physical
hardware later, so the same assertions gate both.

## What works today

- Capability-level assertion API (`OH_EXPECT`) and a suite runner
- Abstract device target: `connect`, `read_sensor`, `set_mode`
- Twin target backend, driving the simulator, SDK, and protocol layer
- Test categories: functional (thermostat acceptance), connectivity (commissioning
  across packet-loss conditions), and reliability (a soak loop that re-commissions and
  re-reads over many independently seeded lossy links)
- Target selection: unavailable targets are skipped, so suites are green on the twin
  while staying ready for hardware

## Layout

- `include/openhome/test.h` — assertion API and the device target interface
- `src/assert.c` — suite runner
- `src/target_twin.c` — twin-backed target
- `src/target_hil.c` — hardware-in-the-loop target (drives a real board over serial)
- `suites/thermostat/` — functional acceptance suite (runs against every target)
- `suites/connectivity/` — commissioning under packet loss
- `suites/reliability/` — soak loop over many lossy commissioning cycles
- `suites/generated/` — runs the manifest-generated acceptance suite (from the
  device-engine test-stub generator) against the twin, closing the DDL-to-tests loop

## Running

Against the twin only (the default; CI runs this, no hardware required):

```sh
make -C tests test
```

Against a real board as well, over its serial console:

```sh
OPENHOME_HIL_PORT=/dev/cu.usbmodemXXXX make -C tests test
```

The hardware-in-the-loop target reads the board's telemetry stream to satisfy `read_sensor`
and writes `command key=<key> mode=<mode>` lines (confirmed by the firmware's `actuator ...`
acknowledgment) to satisfy `set_mode`, so the same suites gate the twin and physical silicon
unchanged. Without `OPENHOME_HIL_PORT` the target reports itself unavailable and is skipped.

## Not yet implemented

A full physical test rack — a board farm, flashing agents, and instruments (relays, power,
logic analyzer) — is future work. The single-board serial HIL above covers sensor reads and
actuator control; a rack extends it to many boards and electrical measurement.
