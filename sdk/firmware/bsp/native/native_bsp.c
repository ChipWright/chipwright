#include "native_bsp.h"

#include "chipwright/hal.h"

// Simulated temperature that drifts upward each sample, so telemetry visibly changes
// across ticks without any physical sensor attached.
static float g_temperature_celsius = 21.5f;

static cw_status_t native_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  g_temperature_celsius += 0.25f;
  *out_value = g_temperature_celsius;
  return CW_OK;
}

static cw_status_t native_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  cw_log(CW_LOG_INFO, "hvac mode set to %d", mode);
  return CW_OK;
}

cw_status_t cw_native_bsp_register(void) {
  const cw_sensor_driver_t temperature = {.read = native_temperature_read, .ctx = NULL};
  const cw_status_t status = cw_hal_register_sensor("temperature_sensor", "celsius", temperature);
  if (status != CW_OK) {
    return status;
  }
  const cw_actuator_driver_t hvac = {.set_mode = native_hvac_set_mode, .ctx = NULL};
  return cw_hal_register_actuator("hvac", hvac);
}
