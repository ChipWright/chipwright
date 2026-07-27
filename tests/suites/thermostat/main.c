// Capability-level acceptance suite for the smart_thermostat, written against the
// abstract device target so it runs on the twin now and on hardware later unchanged.
//
// It mirrors the roadmap's north-star test: connect, read a sensor within its declared
// range, and drive an actuator.

#include "chipwright/test.h"

#include "target_hil.h"
#include "target_twin.h"

#include <stdio.h>

// Declared temperature range from the thermostat manifest.
#define THERMOSTAT_TEMP_MIN (-20.0f)
#define THERMOSTAT_TEMP_MAX (50.0f)
#define HVAC_MODE_COOLING 1

static void thermostat_suite(cw_test_run_t *run, cw_test_target_t *target) {
  CW_EXPECT(run, target->connect(target->ctx) == CW_OK);

  float temperature = 0.0f;
  CW_EXPECT(run, target->read_sensor(target->ctx, "temperature_sensor", &temperature) == CW_OK);
  CW_EXPECT(run, temperature > THERMOSTAT_TEMP_MIN && temperature < THERMOSTAT_TEMP_MAX);

  CW_EXPECT(run, target->set_mode(target->ctx, "hvac", HVAC_MODE_COOLING) == CW_OK);

  float missing = 0.0f;
  CW_EXPECT(run, target->read_sensor(target->ctx, "no_such_sensor", &missing) == CW_ERR_NOT_FOUND);
}

static int run_against(cw_test_target_t *target) {
  if (!target->available) {
    printf("skipping target %s: not available\n", target->name);
    return 0;
  }
  cw_test_run_t run;
  char label[64];
  snprintf(label, sizeof(label), "thermostat/%s", target->name);
  cw_test_begin(&run, label);
  thermostat_suite(&run, target);
  return cw_test_end(&run);
}

int main(void) {
  int rc = 0;

  twin_target_state_t twin_state;
  cw_test_target_t twin;
  cw_test_target_twin_init(&twin, &twin_state);
  rc |= run_against(&twin);

  cw_test_target_t hil;
  cw_test_target_hil_init(&hil);
  rc |= run_against(&hil);

  return rc;
}
