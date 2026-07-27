# Run it on real hardware

The platform is twin-first: everything in the [guided tour](guided-tour.md) runs and is tested
without a board. It is also proven on real silicon (ESP32-C6).

- **Telemetry firmware.** The manifest-generated firmware streams live temperature from the
  chip's on-die sensor. [`sdk/firmware/targets/esp32c6`](../sdk/firmware/targets/esp32c6).
- **Hardware-in-the-loop testing.** The same acceptance suite runs against the twin and the
  physical board over its serial console, unchanged, via `CHIPWRIGHT_HIL_PORT`. It reads
  telemetry for sensors and sends commands (confirmed by the firmware) to drive the HVAC
  actuator on a real GPIO.
- **Real Matter.** A Matter-over-Wi-Fi build that commissions onto a Matter fabric, and a
  controller reads the live temperature back over the fabric (verified with chip-tool).
  [`sdk/firmware/targets/esp32c6-matter`](../sdk/firmware/targets/esp32c6-matter).
- **Signed OTA.** The device verifies a cloud-signed image (SHA-256 plus Ed25519 against a
  baked-in key), applies it, and the bootloader rolls back a build that fails its self-test.
  [`sdk/firmware/targets/esp32c6-ota`](../sdk/firmware/targets/esp32c6-ota).

```sh
# telemetry
idf.py -C sdk/firmware/targets/esp32c6 set-target esp32c6 build flash monitor
# HIL: run the acceptance suite against the board (sensors and actuator)
CHIPWRIGHT_HIL_PORT=/dev/tty.usbmodem1401 make -C tests/suites/thermostat run
```

Want a chip that isn't supported yet? That is exactly the contribution the project invites.
See [adding a board](adding-a-board.md).
