#include "openhome/test.h"

#include <stdio.h>

void oh_test_begin(oh_test_run_t *run, const char *name) {
  run->name = name;
  run->checks = 0;
  run->failures = 0;
  printf("running suite: %s\n", name);
}

void oh_test_check(oh_test_run_t *run, bool ok, const char *expr, const char *file, int line) {
  run->checks++;
  if (!ok) {
    run->failures++;
    fprintf(stderr, "  not ok %s:%d: %s\n", file, line, expr);
  }
}

int oh_test_end(oh_test_run_t *run) {
  printf("suite %s: %u checks, %u failure(s)\n", run->name, run->checks, run->failures);
  return run->failures == 0 ? 0 : 1;
}
