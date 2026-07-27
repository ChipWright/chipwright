#include "chipwright/sim.h"

static cw_status_t fault_read(void *ctx, float *out_value) {
  cw_fault_sensor_t *sensor = ctx;

  switch (sensor->fault.kind) {
    case CW_FAULT_FAIL:
      return CW_ERR_IO;

    case CW_FAULT_STUCK:
      if (!sensor->has_last) {
        return CW_ERR_IO;
      }
      *out_value = sensor->last_value;
      return CW_OK;

    case CW_FAULT_OFFSET:
    case CW_FAULT_NONE: {
      float value = 0.0f;
      const cw_status_t status = sensor->inner.read(sensor->inner.ctx, &value);
      if (status != CW_OK) {
        return status;
      }
      if (sensor->fault.kind == CW_FAULT_OFFSET) {
        value += sensor->fault.offset;
      }
      sensor->last_value = value;
      sensor->has_last = true;
      *out_value = value;
      return CW_OK;
    }
  }

  return CW_ERR_INVALID;
}

void cw_fault_sensor_init(cw_fault_sensor_t *sensor, cw_sensor_driver_t inner) {
  sensor->inner = inner;
  sensor->fault.kind = CW_FAULT_NONE;
  sensor->fault.offset = 0.0f;
  sensor->last_value = 0.0f;
  sensor->has_last = false;
}

void cw_fault_sensor_set(cw_fault_sensor_t *sensor, cw_fault_config_t fault) {
  sensor->fault = fault;
}

cw_sensor_driver_t cw_fault_sensor_driver(cw_fault_sensor_t *sensor) {
  const cw_sensor_driver_t driver = {.read = fault_read, .ctx = sensor};
  return driver;
}
