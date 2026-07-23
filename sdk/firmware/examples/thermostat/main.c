// Reference firmware for the smart_thermostat device. It implements the capability
// prototypes declared in the generated interface header by delegating to the HAL, then
// runs the SDK sampling loop. Building this proves the Phase 1 path end to end:
// manifest -> generated interface -> SDK + HAL -> a binary that logs telemetry.

#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "native_bsp.h"
#include "smart_thermostat_interface.h"

oh_status_t oh_temperature_sensor_read(float *out_value) {
  return oh_hal_read_sensor("temperature_sensor", out_value);
}

oh_status_t oh_hvac_set_mode(oh_hvac_mode_t mode) {
  return oh_hal_set_actuator_mode("hvac", (int)mode);
}

int main(void) {
  const oh_device_t device = {.name = "smart_thermostat"};

  if (oh_native_bsp_register() != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to register native board support");
    return 1;
  }
  if (oh_device_init(&device) != OH_OK) {
    oh_log(OH_LOG_ERROR, "failed to initialize device");
    return 1;
  }

  oh_device_run(&device, 5);
  oh_hvac_set_mode(OH_HVAC_MODE_COOLING);
  return 0;
}
