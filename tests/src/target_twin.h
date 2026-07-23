#ifndef OPENHOME_TEST_TARGET_TWIN_H
#define OPENHOME_TEST_TARGET_TWIN_H

#include "openhome/sim.h"
#include "openhome/test.h"

// State backing a twin target. The caller owns it so the target holds no globals.
typedef struct {
  oh_sim_source_t source;
  oh_fault_sensor_t sensor;
  oh_twin_network_t network;
} twin_target_state_t;

void oh_test_target_twin_init(oh_test_target_t *target, twin_target_state_t *state);

#endif  // OPENHOME_TEST_TARGET_TWIN_H
