#include "chipwright/test.h"

#include <stdio.h>

void cw_test_begin(cw_test_run_t *run, const char *name) {
  run->name = name;
  run->checks = 0;
  run->failures = 0;
  printf("running suite: %s\n", name);
}

void cw_test_check(cw_test_run_t *run, bool ok, const char *expr, const char *file, int line) {
  run->checks++;
  if (!ok) {
    run->failures++;
    fprintf(stderr, "  not ok %s:%d: %s\n", file, line, expr);
  }
}

int cw_test_end(cw_test_run_t *run) {
  printf("suite %s: %u checks, %u failure(s)\n", run->name, run->checks, run->failures);
  return run->failures == 0 ? 0 : 1;
}
