// Connectivity suite: commissioning behavior across network conditions. Packet loss is
// seeded so the outcomes are deterministic and safe for CI.

#include "chipwright/protocol.h"
#include "chipwright/test.h"

static void connectivity_suite(cw_test_run_t *run) {
  cw_sim_transport_t clean;
  cw_sim_transport_init(&clean, 0, 1);
  cw_matter_session_t clean_session;
  cw_matter_session_init(&clean_session, "smart_thermostat");
  CW_EXPECT(run, cw_matter_commission(&clean_session, &clean, 5) == CW_OK);
  CW_EXPECT(run, clean_session.retries_used == 0);

  cw_sim_transport_t lossy;
  cw_sim_transport_init(&lossy, 50, 777);
  cw_matter_session_t lossy_session;
  cw_matter_session_init(&lossy_session, "smart_thermostat");
  CW_EXPECT(run, cw_matter_commission(&lossy_session, &lossy, 20) == CW_OK);
  CW_EXPECT(run, lossy_session.retries_used > 0);

  cw_sim_transport_t dead;
  cw_sim_transport_init(&dead, 100, 1);
  cw_matter_session_t dead_session;
  cw_matter_session_init(&dead_session, "smart_thermostat");
  CW_EXPECT(run, cw_matter_commission(&dead_session, &dead, 3) == CW_ERR_IO);
}

int main(void) {
  cw_test_run_t run;
  cw_test_begin(&run, "connectivity/twin");
  connectivity_suite(&run);
  return cw_test_end(&run);
}
