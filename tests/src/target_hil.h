#ifndef CHIPWRIGHT_TEST_TARGET_HIL_H
#define CHIPWRIGHT_TEST_TARGET_HIL_H

#include "chipwright/test.h"

// Initializes a hardware-in-the-loop target that drives a real board over its serial
// console. Set CHIPWRIGHT_HIL_PORT to the board's serial device to enable it; otherwise the
// target reports itself unavailable and the runner skips it, so the same suite runs against
// the twin in CI and against physical hardware when a board is attached.
void cw_test_target_hil_init(cw_test_target_t *target);

#endif  // CHIPWRIGHT_TEST_TARGET_HIL_H
