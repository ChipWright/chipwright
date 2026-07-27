// Reliability suite: a soak loop that re-commissions and re-reads the device many times,
// each cycle over an independently seeded lossy link. This is the simulation analog of a
// hardware reliability run (for example the spec's 10,000 power cycles); on hardware the
// same shape drives real power cycling through the HIL rack.

#include "chipwright/hal.h"
#include "chipwright/protocol.h"
#include "chipwright/sim.h"
#include "chipwright/test.h"

#include <stdio.h>

#define RELIABILITY_CYCLES 5000

int main(void) {
  cw_test_run_t run;
  cw_test_begin(&run, "reliability/twin");

  unsigned commissioned = 0;
  unsigned reads_in_range = 0;

  for (unsigned cycle = 0; cycle < RELIABILITY_CYCLES; cycle++) {
    cw_hal_reset();
    cw_sim_source_t source;
    cw_sim_source_init(&source, 21.0f, 0.5f);
    cw_fault_sensor_t sensor;
    cw_fault_sensor_init(&sensor, cw_sim_source_driver(&source));
    cw_hal_register_sensor("temperature_sensor", "celsius", cw_fault_sensor_driver(&sensor));

    cw_twin_network_t network;
    cw_twin_network_init(&network, 30, cycle + 1);
    cw_matter_session_t session;
    if (cw_twin_commission(&network, "smart_thermostat", 30, &session) == CW_OK) {
      commissioned++;
    }

    float temperature = 0.0f;
    if (cw_hal_read_sensor("temperature_sensor", &temperature) == CW_OK &&
        temperature > -20.0f && temperature < 50.0f) {
      reads_in_range++;
    }
  }

  CW_EXPECT(&run, commissioned == RELIABILITY_CYCLES);
  CW_EXPECT(&run, reads_in_range == RELIABILITY_CYCLES);
  printf("reliability: %u/%u commissioned, %u/%u reads in range\n", commissioned,
         RELIABILITY_CYCLES, reads_in_range, RELIABILITY_CYCLES);
  return cw_test_end(&run);
}
