#include "openhome/sdk.h"

#include "openhome/hal.h"

oh_status_t oh_device_init(const oh_device_t *device) {
  if (device == NULL || device->name == NULL) {
    return OH_ERR_INVALID;
  }
  oh_log(OH_LOG_INFO, "device %s initializing with %u sensor(s)", device->name,
         oh_hal_sensor_count());
  return OH_OK;
}

oh_status_t oh_device_run(const oh_device_t *device, unsigned ticks) {
  if (device == NULL) {
    return OH_ERR_INVALID;
  }
  for (unsigned tick = 0; tick < ticks; tick++) {
    const unsigned count = oh_hal_sensor_count();
    for (unsigned i = 0; i < count; i++) {
      const char *key = NULL;
      const char *unit = NULL;
      float value = 0.0f;
      const oh_status_t status = oh_hal_sensor_at(i, &key, &unit, &value);
      if (status != OH_OK) {
        oh_log(OH_LOG_WARN, "sensor read failed with status %d", (int)status);
        continue;
      }
      oh_telemetry_emit(key, value, unit);
    }
  }
  return OH_OK;
}
