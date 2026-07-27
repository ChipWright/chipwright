// Runs the manifest-generated acceptance suite against the twin. The suite body is
// emitted by the device-engine test-stub generator from the device manifest, so this
// proves the generated tests compile and pass, closing the DDL-to-tests loop.

#include "chipwright/test.h"

#include "target_twin.h"

// Defined in the generated suite compiled alongside this runner.
void cw_generated_suite(cw_test_run_t *run, cw_test_target_t *target);

int main(void) {
  twin_target_state_t state;
  cw_test_target_t twin;
  cw_test_target_twin_init(&twin, &state);

  cw_test_run_t run;
  cw_test_begin(&run, "generated/twin");
  cw_generated_suite(&run, &twin);
  return cw_test_end(&run);
}
