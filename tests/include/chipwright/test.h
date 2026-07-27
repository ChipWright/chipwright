#ifndef CHIPWRIGHT_TEST_H
#define CHIPWRIGHT_TEST_H

#include <stdbool.h>

#include "chipwright/sdk.h"

// Automated testing framework. Suites are written once against an abstract device target
// and run identically on the digital twin today and on physical hardware later, so the
// same assertions gate both. This is branches 6 and 7 of the platform.

// A device under test. Backends implement these operations; a suite never knows whether
// it is talking to a twin or a real board.
typedef struct {
  const char *name;
  bool available;
  cw_status_t (*connect)(void *ctx);
  cw_status_t (*read_sensor)(void *ctx, const char *key, float *out_value);
  cw_status_t (*set_mode)(void *ctx, const char *key, int mode);
  void *ctx;
} cw_test_target_t;

// Accumulates the results of one suite run.
typedef struct {
  const char *name;
  unsigned checks;
  unsigned failures;
} cw_test_run_t;

void cw_test_begin(cw_test_run_t *run, const char *name);
void cw_test_check(cw_test_run_t *run, bool ok, const char *expr, const char *file, int line);

// Prints a summary and returns 0 when every check passed, 1 otherwise.
int cw_test_end(cw_test_run_t *run);

#define CW_EXPECT(run, cond) cw_test_check((run), (cond), #cond, __FILE__, __LINE__)

#endif  // CHIPWRIGHT_TEST_H
