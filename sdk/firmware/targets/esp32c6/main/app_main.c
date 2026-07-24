// First-light firmware for the smart_thermostat on real ESP32-C6 silicon. It implements
// the generated capability prototypes by delegating to the HAL, registers the ESP32 BSP
// (the on-die temperature sensor), and streams telemetry continuously. This is the same
// manifest -> generated interface -> SDK + HAL path the digital twin runs, now on a chip.

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

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

void app_main(void) {
  const oh_device_t device = {.name = "smart_thermostat"};

  if (oh_esp32_bsp_register() != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to register esp32 board support");
    return;
  }
  if (oh_device_init(&device) != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to initialize device");
    return;
  }

  // Stream telemetry indefinitely: each cycle samples every registered sensor and emits a
  // sample. A one-second delay between cycles keeps the console readable.
  for (;;) {
    oh_device_run(&device, 1);
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
