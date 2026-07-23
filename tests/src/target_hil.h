#ifndef OPENHOME_TEST_TARGET_HIL_H
#define OPENHOME_TEST_TARGET_HIL_H

#include "openhome/test.h"

// Initializes a hardware-in-the-loop target. Until a physical rack is connected the
// target reports itself unavailable, so the runner skips it while keeping the same suite
// ready to run against real hardware unchanged.
void oh_test_target_hil_init(oh_test_target_t *target);

#endif  // OPENHOME_TEST_TARGET_HIL_H
