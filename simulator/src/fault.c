#include "openhome/sim.h"

static oh_status_t fault_read(void *ctx, float *out_value) {
  oh_fault_sensor_t *sensor = ctx;

  switch (sensor->fault.kind) {
    case OH_FAULT_FAIL:
      return OH_ERR_IO;

    case OH_FAULT_STUCK:
      if (!sensor->has_last) {
        return OH_ERR_IO;
      }
      *out_value = sensor->last_value;
      return OH_OK;

    case OH_FAULT_OFFSET:
    case OH_FAULT_NONE: {
      float value = 0.0f;
      const oh_status_t status = sensor->inner.read(sensor->inner.ctx, &value);
      if (status != OH_OK) {
        return status;
      }
      if (sensor->fault.kind == OH_FAULT_OFFSET) {
        value += sensor->fault.offset;
      }
      sensor->last_value = value;
      sensor->has_last = true;
      *out_value = value;
      return OH_OK;
    }
  }

  return OH_ERR_INVALID;
}

void oh_fault_sensor_init(oh_fault_sensor_t *sensor, oh_sensor_driver_t inner) {
  sensor->inner = inner;
  sensor->fault.kind = OH_FAULT_NONE;
  sensor->fault.offset = 0.0f;
  sensor->last_value = 0.0f;
  sensor->has_last = false;
}

void oh_fault_sensor_set(oh_fault_sensor_t *sensor, oh_fault_config_t fault) {
  sensor->fault = fault;
}

oh_sensor_driver_t oh_fault_sensor_driver(oh_fault_sensor_t *sensor) {
  const oh_sensor_driver_t driver = {.read = fault_read, .ctx = sensor};
  return driver;
}
