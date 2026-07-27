#include "chipwright/sdk.h"

#include "chipwright/hal.h"

cw_status_t cw_device_init(const cw_device_t *device) {
  if (device == NULL || device->name == NULL) {
    return CW_ERR_INVALID;
  }
  cw_log(CW_LOG_INFO, "device %s initializing with %u sensor(s)", device->name,
         cw_hal_sensor_count());
  return CW_OK;
}

cw_status_t cw_device_run(const cw_device_t *device, unsigned ticks) {
  if (device == NULL) {
    return CW_ERR_INVALID;
  }
  for (unsigned tick = 0; tick < ticks; tick++) {
    const unsigned count = cw_hal_sensor_count();
    for (unsigned i = 0; i < count; i++) {
      const char *key = NULL;
      const char *unit = NULL;
      float value = 0.0f;
      const cw_status_t status = cw_hal_sensor_at(i, &key, &unit, &value);
      if (status != CW_OK) {
        cw_log(CW_LOG_WARN, "sensor read failed with status %d", (int)status);
        continue;
      }
      cw_telemetry_emit(key, value, unit);
    }
  }
  return CW_OK;
}
