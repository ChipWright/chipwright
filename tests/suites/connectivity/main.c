// Connectivity suite: commissioning behavior across network conditions. Packet loss is
// seeded so the outcomes are deterministic and safe for CI.

#include "openhome/protocol.h"
#include "openhome/test.h"

static void connectivity_suite(oh_test_run_t *run) {
  oh_sim_transport_t clean;
  oh_sim_transport_init(&clean, 0, 1);
  oh_matter_session_t clean_session;
  oh_matter_session_init(&clean_session, "smart_thermostat");
  OH_EXPECT(run, oh_matter_commission(&clean_session, &clean, 5) == OH_OK);
  OH_EXPECT(run, clean_session.retries_used == 0);

  oh_sim_transport_t lossy;
  oh_sim_transport_init(&lossy, 50, 777);
  oh_matter_session_t lossy_session;
  oh_matter_session_init(&lossy_session, "smart_thermostat");
  OH_EXPECT(run, oh_matter_commission(&lossy_session, &lossy, 20) == OH_OK);
  OH_EXPECT(run, lossy_session.retries_used > 0);

  oh_sim_transport_t dead;
  oh_sim_transport_init(&dead, 100, 1);
  oh_matter_session_t dead_session;
  oh_matter_session_init(&dead_session, "smart_thermostat");
  OH_EXPECT(run, oh_matter_commission(&dead_session, &dead, 3) == OH_ERR_IO);
}

int main(void) {
  oh_test_run_t run;
  oh_test_begin(&run, "connectivity/twin");
  connectivity_suite(&run);
  return oh_test_end(&run);
}
