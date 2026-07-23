// Runs the manifest-generated acceptance suite against the twin. The suite body is
// emitted by the device-engine test-stub generator from the device manifest, so this
// proves the generated tests compile and pass, closing the DDL-to-tests loop.

#include "openhome/test.h"

#include "target_twin.h"

// Defined in the generated suite compiled alongside this runner.
void oh_generated_suite(oh_test_run_t *run, oh_test_target_t *target);

int main(void) {
  twin_target_state_t state;
  oh_test_target_t twin;
  oh_test_target_twin_init(&twin, &state);

  oh_test_run_t run;
  oh_test_begin(&run, "generated/twin");
  oh_generated_suite(&run, &twin);
  return oh_test_end(&run);
}
