// First-light firmware for the smart_thermostat on real ESP32-C6 silicon. It implements
// the generated capability prototypes by delegating to the HAL, registers the ESP32 BSP
// (the on-die temperature sensor and the HVAC GPIO actuator), streams telemetry, and
// accepts inbound actuator commands over the same serial console. This is the same
// manifest -> generated interface -> SDK + HAL path the digital twin runs, now on a chip.

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#include "driver/usb_serial_jtag.h"
#include "driver/usb_serial_jtag_vfs.h"

#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "esp32_bsp.h"
#include "smart_thermostat_interface.h"

oh_status_t oh_temperature_sensor_read(float *out_value) {
  return oh_hal_read_sensor("temperature_sensor", out_value);
}

oh_status_t oh_hvac_set_mode(oh_hvac_mode_t mode) {
  return oh_hal_set_actuator_mode("hvac", (int)mode);
}

// Drains any bytes waiting on the USB-Serial-JTAG console and applies a command once a full
// line has arrived. Reads are non-blocking so the telemetry cadence is never stalled waiting
// for input. One partial line is buffered across calls.
static void poll_commands(void) {
  static char line[128];
  static size_t len = 0;
  uint8_t byte = 0;
  while (usb_serial_jtag_read_bytes(&byte, 1, 0) == 1) {
    if (byte == '\n' || byte == '\r') {
      if (len > 0) {
        line[len] = '\0';
        oh_command_apply(line);
        len = 0;
      }
    } else if (len + 1 < sizeof line) {
      line[len++] = (char)byte;
    } else {
      // Overlong line without a terminator: reset rather than truncate silently.
      len = 0;
    }
  }
}

void app_main(void) {
  const oh_device_t device = {.name = "smart_thermostat"};

  usb_serial_jtag_driver_config_t usb_config = USB_SERIAL_JTAG_DRIVER_CONFIG_DEFAULT();
  if (usb_serial_jtag_driver_install(&usb_config) != ESP_OK) {
    oh_log(OH_LOG_ERROR, "failed to install serial command channel");
    return;
  }
  // Route stdout through the driver so telemetry output and command input share the console
  // consistently rather than contending for the peripheral.
  usb_serial_jtag_vfs_use_driver();

  if (oh_esp32_bsp_register() != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to register esp32 board support");
    return;
  }
  if (oh_device_init(&device) != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to initialize device");
    return;
  }

  // Stream telemetry indefinitely: each cycle samples every registered sensor, emits a
  // sample, and applies any actuator command that has arrived. A one-second delay between
  // cycles keeps the console readable.
  for (;;) {
    oh_device_run(&device, 1);
    poll_commands();
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
