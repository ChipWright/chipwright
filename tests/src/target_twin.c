#include "openhome/test.h"

#include "openhome/hal.h"
#include "openhome/sim.h"

#include "target_twin.h"

// Records the last actuator mode applied, so a simulated actuator can be registered
// without a physical driver.
static int g_twin_last_mode = -1;

static oh_status_t twin_actuator_set(void *ctx, int mode) {
  (void)ctx;
  g_twin_last_mode = mode;
  return OH_OK;
}

static oh_status_t twin_connect(void *ctx) {
  twin_target_state_t *state = ctx;
  oh_matter_session_t session;
  return oh_twin_commission(&state->network, "smart_thermostat", 20, &session);
}

static oh_status_t twin_read_sensor(void *ctx, const char *key, float *out_value) {
  (void)ctx;
  return oh_hal_read_sensor(key, out_value);
}

static oh_status_t twin_set_mode(void *ctx, const char *key, int mode) {
  (void)ctx;
  return oh_hal_set_actuator_mode(key, mode);
}

void oh_test_target_twin_init(oh_test_target_t *target, twin_target_state_t *state) {
  oh_hal_reset();
  oh_sim_source_init(&state->source, 21.0f, 0.5f);
  oh_fault_sensor_init(&state->sensor, oh_sim_source_driver(&state->source));
  oh_hal_register_sensor("temperature_sensor", "celsius", oh_fault_sensor_driver(&state->sensor));

  const oh_actuator_driver_t hvac = {.set_mode = twin_actuator_set, .ctx = NULL};
  oh_hal_register_actuator("hvac", hvac);

  // A lossy link, so connect exercises commissioning retries rather than a clean path.
  oh_twin_network_init(&state->network, 30, 4242);

  target->name = "twin";
  target->available = true;
  target->connect = twin_connect;
  target->read_sensor = twin_read_sensor;
  target->set_mode = twin_set_mode;
  target->ctx = state;
}
