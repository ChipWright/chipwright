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
