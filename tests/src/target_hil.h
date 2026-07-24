#ifndef OPENHOME_TEST_TARGET_HIL_H
#define OPENHOME_TEST_TARGET_HIL_H

#include "openhome/test.h"

// Initializes a hardware-in-the-loop target that drives a real board over its serial
// console. Set OPENHOME_HIL_PORT to the board's serial device to enable it; otherwise the
// target reports itself unavailable and the runner skips it, so the same suite runs against
// the twin in CI and against physical hardware when a board is attached.
void oh_test_target_hil_init(oh_test_target_t *target);

#endif  // OPENHOME_TEST_TARGET_HIL_H
