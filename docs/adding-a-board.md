# Adding a board

This guide walks through bringing a new chip to OpenHome Studio by writing a **board support
package** (BSP). A BSP is the only thing that knows about your silicon. Everything above it (the
device definition, the generated firmware interface, the SDK, the twin, and the acceptance tests)
is written against capability traits and does not change per chip.

The firmware tree is Apache-2.0, so your BSP can be shipped and relicensed freely. The worked
reference is the ESP32-C6 support in [`sdk/firmware/bsp/esp32`](../sdk/firmware/bsp/esp32) and
the target in [`sdk/firmware/targets/esp32c6`](../sdk/firmware/targets/esp32c6).

## The model

Device logic talks to the **Hardware Abstraction Layer** ([`sdk/firmware/include/openhome/hal.h`](../sdk/firmware/include/openhome/hal.h))
in terms of capability traits, not registers:

- a **sensor** driver reads a scalar value, and
- an **actuator** driver applies a mode.

A BSP implements those driver functions for your chip and registers them under the capability
keys a device definition uses (for the thermostat: the `temperature_sensor` sensor and the
`hvac` actuator). Nothing above the HAL knows how the value was read or the mode applied.

```
device.yaml ─▶ generated interface ─▶ SDK ─▶ HAL ─▶  your BSP  ─▶ chip
                                                      (this guide)
```

## 1. Implement the drivers

Create `sdk/firmware/bsp/<yourchip>/<yourchip>_bsp.c`. A sensor driver fills an output value;
an actuator driver applies an integer mode. Return `OH_OK` on success or an `oh_status_t` error.

```c
#include "openhome/hal.h"
#include "openhome/sdk.h"

static oh_status_t mychip_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  // Read your sensor here and convert to the unit the manifest declares (celsius).
  *out_value = /* ... */ 0.0f;
  return OH_OK;
}

static oh_status_t mychip_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  // Drive your actuator here (a GPIO, a relay, a PWM channel, ...).
  return OH_OK;
}
```

## 2. Register the drivers

Expose a single registration function that binds each driver to its capability key. The keys
and the sensor's unit must match the device definition (`examples/thermostat/device.yaml`).

```c
oh_status_t oh_mychip_bsp_register(void) {
  const oh_sensor_driver_t temperature = {.read = mychip_temperature_read, .ctx = NULL};
  oh_status_t status = oh_hal_register_sensor("temperature_sensor", "celsius", temperature);
  if (status != OH_OK) {
    return status;
  }
  const oh_actuator_driver_t hvac = {.set_mode = mychip_hvac_set_mode, .ctx = NULL};
  return oh_hal_register_actuator("hvac", hvac);
}
```

Declare it in `sdk/firmware/bsp/<yourchip>/<yourchip>_bsp.h`. Compare with
[`bsp/native`](../sdk/firmware/bsp/native) (a host stub) and
[`bsp/esp32`](../sdk/firmware/bsp/esp32) (real silicon).

## 3. Add a host compile check

CI has no vendor toolchains, so a BSP ships with a **host compile check**: minimal stub headers
for the vendor APIs your `.c` file includes, plus a `make hostcheck` target that compiles the
BSP to an object file with `-Wall -Wextra -Werror`. This catches interface drift without a
board. Mirror [`sdk/firmware/bsp/esp32/hostcheck`](../sdk/firmware/bsp/esp32/hostcheck) and its
`Makefile`: each vendor header you include (e.g. `driver/gpio.h`) gets a small stub under
`hostcheck/` declaring just the types and functions you use.

```sh
make -C sdk/firmware/bsp/<yourchip> hostcheck
```

## 4. Add a target

A target is the buildable firmware application for your chip: it registers the BSP, initializes
the device, and runs the SDK loop. Use [`sdk/firmware/targets/esp32c6`](../sdk/firmware/targets/esp32c6)
as the template. Its `app_main` calls `oh_<chip>_bsp_register()`, then `oh_device_init()`, then
`oh_device_run()`. Reference the shared SDK and BSP sources by relative path so the board builds
from the same code the twin runs. Include the generated `smart_thermostat_interface.h` and
implement its capability prototypes by delegating to the HAL.

If your chip's console supports input, wiring the SDK's serial command channel
(`oh_command_apply`) lets the hardware-in-the-loop tests drive actuators; see the ESP32-C6
target for the pattern.

## 5. Test it

Run the shared acceptance suite against the digital twin first; it must pass with no board:

```sh
make -C tests test
```

Then, with the board flashed and streaming over its serial console, run the same suite against
real hardware unchanged:

```sh
OPENHOME_HIL_PORT=/dev/tty.<your-port> make -C tests/suites/thermostat run
```

The hardware-in-the-loop backend reads the telemetry stream to satisfy sensor reads and sends
commands (confirmed by the firmware) to drive actuators, so the identical assertions gate the
twin and your silicon.

## 6. Record the evidence

Support is earned from evidence, not asserted. When you run the acceptance suite against your
board, capture the result as a board conformance record and commit it next to your BSP under
`sdk/firmware/bsp/<chip>/conformance/`:

```sh
OPENHOME_HIL_PORT=/dev/tty.<your-port> make -C tests/suites/thermostat run | \
  pnpm --filter @openhome/conformance board record \
    --chip <chip> --bsp <bsp> --class thermostat \
    --commit "$(git rev-parse --short HEAD)" --toolchain <toolchain> --submitter "<you>" \
    > sdk/firmware/bsp/<chip>/conformance/thermostat-<chip>.json
```

A passing community record earns the `community-verified` tier; a maintainer marks a reviewed run
`verified`. See the current support table with:

```sh
pnpm --filter @openhome/conformance board list sdk/firmware/bsp
```

## 7. Submit

Open a pull request describing the chip, the wiring, and how you tested it (twin, and HIL if you
have the board), and include your conformance record. Contributions to `sdk/firmware/` are
accepted under Apache-2.0. Board specifics belong inside your BSP and target; do not change shared
SDK behavior.
