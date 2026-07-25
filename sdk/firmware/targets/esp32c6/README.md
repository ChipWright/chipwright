# ESP32-C6 target

First-light firmware for the `smart_thermostat` on real ESP32-C6 silicon. It runs the same
`manifest -> generated interface -> SDK + HAL` path the digital twin runs, with the ESP32
BSP backed by the chip's **on-die temperature sensor** — so no external parts are needed.

## Prerequisites

Install ESP-IDF (v5.1 or newer, which supports the C6) once:

```sh
mkdir -p ~/esp && cd ~/esp
git clone -b v5.3.1 --recursive https://github.com/espressif/esp-idf.git
cd esp-idf && ./install.sh esp32c6
```

Then, in each shell where you build, load the toolchain:

```sh
. ~/esp/esp-idf/export.sh
```

## Build, flash, and watch first light

From the repository root, with the board plugged in over USB:

```sh
idf.py -C sdk/firmware/targets/esp32c6 set-target esp32c6 build flash monitor
```

Pick the serial port with `-p <port>` if auto-detection does not find it. The C6 DevKitC-1
exposes two ports (a USB-to-UART bridge and native USB-Serial-JTAG); if one does not work,
try the other. Exit the monitor with `Ctrl-]`.

You should see the device initialize and stream temperature telemetry once per second,
read from the chip's on-die sensor.

## Actuator commands

The firmware accepts inbound commands on the same USB-Serial-JTAG console it streams
telemetry on. Send a line of the form:

```
command key=hvac mode=1
```

The HVAC actuator drives **GPIO10** (asserted for any non-off mode, deasserted for off) and
the firmware echoes an acknowledgment so the sender can confirm the applied state:

```
actuator key=hvac mode=1
```

This is the channel the hardware-in-the-loop acceptance backend (`tests/src/target_hil.c`)
uses to drive and verify actuators, so the same suites that run on the twin also exercise
actuator control on real silicon. Run them against the board with:

```sh
OPENHOME_HIL_PORT=/dev/cu.usbmodemXXXX tests/suites/thermostat/build/thermostat_suite
```

## Notes

- `main/smart_thermostat_interface.h` is generated from `examples/thermostat/device.yaml`.
  Change the device and regenerate it with the device engine CLI (see the header comment).
- This project is built by the ESP-IDF toolchain, not the repository's `make`/`pnpm` builds,
  so it is not part of CI (which has no ESP-IDF toolchain). The BSP's logic is covered by
  the host compile check under `sdk/firmware/bsp/esp32/hostcheck`.
