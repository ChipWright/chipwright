// Reliability suite: a soak loop that re-commissions and re-reads the device many times,
// each cycle over an independently seeded lossy link. This is the simulation analog of a
// hardware reliability run (for example the spec's 10,000 power cycles); on hardware the
// same shape drives real power cycling through the HIL rack.

#include "openhome/hal.h"
#include "openhome/protocol.h"
#include "openhome/sim.h"
#include "openhome/test.h"

#include <stdio.h>

#define RELIABILITY_CYCLES 5000

int main(void) {
  oh_test_run_t run;
  oh_test_begin(&run, "reliability/twin");

  unsigned commissioned = 0;
  unsigned reads_in_range = 0;

  for (unsigned cycle = 0; cycle < RELIABILITY_CYCLES; cycle++) {
    oh_hal_reset();
    oh_sim_source_t source;
    oh_sim_source_init(&source, 21.0f, 0.5f);
    oh_fault_sensor_t sensor;
    oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));
    oh_hal_register_sensor("temperature_sensor", "celsius", oh_fault_sensor_driver(&sensor));

    oh_twin_network_t network;
    oh_twin_network_init(&network, 30, cycle + 1);
    oh_matter_session_t session;
    if (oh_twin_commission(&network, "smart_thermostat", 30, &session) == OH_OK) {
      commissioned++;
    }

    float temperature = 0.0f;
    if (oh_hal_read_sensor("temperature_sensor", &temperature) == OH_OK &&
        temperature > -20.0f && temperature < 50.0f) {
      reads_in_range++;
    }
  }

  OH_EXPECT(&run, commissioned == RELIABILITY_CYCLES);
  OH_EXPECT(&run, reads_in_range == RELIABILITY_CYCLES);
  printf("reliability: %u/%u commissioned, %u/%u reads in range\n", commissioned,
         RELIABILITY_CYCLES, reads_in_range, RELIABILITY_CYCLES);
  return oh_test_end(&run);
}
