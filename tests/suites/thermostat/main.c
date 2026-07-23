// Capability-level acceptance suite for the smart_thermostat, written against the
// abstract device target so it runs on the twin now and on hardware later unchanged.
//
// It mirrors the roadmap's north-star test: connect, read a sensor within its declared
// range, and drive an actuator.

#include "openhome/test.h"

#include "target_hil.h"
#include "target_twin.h"

#include <stdio.h>

// Declared temperature range from the thermostat manifest.
#define THERMOSTAT_TEMP_MIN (-20.0f)
#define THERMOSTAT_TEMP_MAX (50.0f)
#define HVAC_MODE_COOLING 1

static void thermostat_suite(oh_test_run_t *run, oh_test_target_t *target) {
  OH_EXPECT(run, target->connect(target->ctx) == OH_OK);

  float temperature = 0.0f;
  OH_EXPECT(run, target->read_sensor(target->ctx, "temperature_sensor", &temperature) == OH_OK);
  OH_EXPECT(run, temperature > THERMOSTAT_TEMP_MIN && temperature < THERMOSTAT_TEMP_MAX);

  OH_EXPECT(run, target->set_mode(target->ctx, "hvac", HVAC_MODE_COOLING) == OH_OK);

  float missing = 0.0f;
  OH_EXPECT(run, target->read_sensor(target->ctx, "no_such_sensor", &missing) == OH_ERR_NOT_FOUND);
}

static int run_against(oh_test_target_t *target) {
  if (!target->available) {
    printf("skipping target %s: not available\n", target->name);
    return 0;
  }
  oh_test_run_t run;
  char label[64];
  snprintf(label, sizeof(label), "thermostat/%s", target->name);
  oh_test_begin(&run, label);
  thermostat_suite(&run, target);
  return oh_test_end(&run);
}

int main(void) {
  int rc = 0;

  twin_target_state_t twin_state;
  oh_test_target_t twin;
  oh_test_target_twin_init(&twin, &twin_state);
  rc |= run_against(&twin);

  oh_test_target_t hil;
  oh_test_target_hil_init(&hil);
  rc |= run_against(&hil);

  return rc;
}
