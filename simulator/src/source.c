#include "chipwright/sim.h"

static cw_status_t source_read(void *ctx, float *out_value) {
  cw_sim_source_t *source = ctx;
  source->value += source->step;
  *out_value = source->value;
  return CW_OK;
}

void cw_sim_source_init(cw_sim_source_t *source, float initial, float step) {
  source->value = initial;
  source->step = step;
}

cw_sensor_driver_t cw_sim_source_driver(cw_sim_source_t *source) {
  const cw_sensor_driver_t driver = {.read = source_read, .ctx = source};
  return driver;
}

static cw_status_t actuator_set_mode(void *ctx, int mode) {
  cw_sim_actuator_t *actuator = ctx;
  actuator->mode = mode;
  cw_log(CW_LOG_INFO, "actuator %s mode %d", actuator->key, mode);
  return CW_OK;
}

void cw_sim_actuator_init(cw_sim_actuator_t *actuator, const char *key) {
  actuator->key = key;
  actuator->mode = 0;
}

cw_actuator_driver_t cw_sim_actuator_driver(cw_sim_actuator_t *actuator) {
  const cw_actuator_driver_t driver = {.set_mode = actuator_set_mode, .ctx = actuator};
  return driver;
}
