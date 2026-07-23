#include "openhome/test.h"

#include "target_hil.h"

// Hardware-in-the-loop backend. This is branch 6 and depends on a physical test rack
// (board farm, flashing agents, instruments). Until that exists the target reports
// itself unavailable and its operations return OH_ERR_NOT_FOUND, so the runner skips it.
// When the rack lands, these operations bind to the rack controller and the same suites
// run on real hardware without change.

static oh_status_t hil_connect(void *ctx) {
  (void)ctx;
  return OH_ERR_NOT_FOUND;
}

static oh_status_t hil_read_sensor(void *ctx, const char *key, float *out_value) {
  (void)ctx;
  (void)key;
  (void)out_value;
  return OH_ERR_NOT_FOUND;
}

static oh_status_t hil_set_mode(void *ctx, const char *key, int mode) {
  (void)ctx;
  (void)key;
  (void)mode;
  return OH_ERR_NOT_FOUND;
}

void oh_test_target_hil_init(oh_test_target_t *target) {
  target->name = "hil (pending hardware rack)";
  target->available = false;
  target->connect = hil_connect;
  target->read_sensor = hil_read_sensor;
  target->set_mode = hil_set_mode;
  target->ctx = NULL;
}
