// Reference firmware for the smart_thermostat device. It implements the capability
// prototypes declared in the generated interface header by delegating to the HAL, then
// runs the SDK sampling loop. Building this proves the Phase 1 path end to end:
// manifest -> generated interface -> SDK + HAL -> a binary that logs telemetry.

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "native_bsp.h"
#include "smart_thermostat_interface.h"

cw_status_t cw_temperature_sensor_read(float *out_value) {
  return cw_hal_read_sensor("temperature_sensor", out_value);
}

cw_status_t cw_hvac_set_mode(cw_hvac_mode_t mode) {
  return cw_hal_set_actuator_mode("hvac", (int)mode);
}

int main(void) {
  const cw_device_t device = {.name = "smart_thermostat"};

  if (cw_native_bsp_register() != CW_OK) {
    cw_log(CW_LOG_ERROR, "failed to register native board support");
    return 1;
  }
  if (cw_device_init(&device) != CW_OK) {
    cw_log(CW_LOG_ERROR, "failed to initialize device");
    return 1;
  }

  cw_device_run(&device, 5);
  cw_hvac_set_mode(CW_HVAC_MODE_COOLING);
  return 0;
}
