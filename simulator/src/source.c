#include "openhome/sim.h"

static oh_status_t source_read(void *ctx, float *out_value) {
  oh_sim_source_t *source = ctx;
  source->value += source->step;
  *out_value = source->value;
  return OH_OK;
}

void oh_sim_source_init(oh_sim_source_t *source, float initial, float step) {
  source->value = initial;
  source->step = step;
}

oh_sensor_driver_t oh_sim_source_driver(oh_sim_source_t *source) {
  const oh_sensor_driver_t driver = {.read = source_read, .ctx = source};
  return driver;
}
