#include "native_bsp.h"

#include "openhome/hal.h"

// Simulated temperature that drifts upward each sample, so telemetry visibly changes
// across ticks without any physical sensor attached.
static float g_temperature_celsius = 21.5f;

static oh_status_t native_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  g_temperature_celsius += 0.25f;
  *out_value = g_temperature_celsius;
  return OH_OK;
}

static oh_status_t native_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  oh_log(OH_LOG_INFO, "hvac mode set to %d", mode);
  return OH_OK;
}

oh_status_t oh_native_bsp_register(void) {
  const oh_sensor_driver_t temperature = {.read = native_temperature_read, .ctx = NULL};
  const oh_status_t status = oh_hal_register_sensor("temperature_sensor", "celsius", temperature);
  if (status != OH_OK) {
    return status;
  }
  const oh_actuator_driver_t hvac = {.set_mode = native_hvac_set_mode, .ctx = NULL};
  return oh_hal_register_actuator("hvac", hvac);
}
