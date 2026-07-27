#ifndef CHIPWRIGHT_TEST_TARGET_TWIN_H
#define CHIPWRIGHT_TEST_TARGET_TWIN_H

#include "chipwright/sim.h"
#include "chipwright/test.h"

// State backing a twin target. The caller owns it so the target holds no globals.
typedef struct {
  cw_sim_source_t source;
  cw_fault_sensor_t sensor;
  cw_twin_network_t network;
} twin_target_state_t;

void cw_test_target_twin_init(cw_test_target_t *target, twin_target_state_t *state);

#endif  // CHIPWRIGHT_TEST_TARGET_TWIN_H
