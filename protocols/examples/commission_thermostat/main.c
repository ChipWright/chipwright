// Commissions the smart_thermostat over the simulated Matter transport, first on a lossy
// link to show it survives packet loss through retries, then on a dead link to show it
// fails cleanly. This is the Phase 2 exit criterion exercised in simulation.

#include "chipwright/protocol.h"

#include <stdio.h>

static void print_clusters(void) {
  const cw_capability_desc_t capabilities[] = {
      {.key = "temperature_sensor", .kind = CW_CAP_SENSOR},
      {.key = "hvac", .kind = CW_CAP_ACTUATOR},
  };
  printf("capability to Matter cluster mapping:\n");
  for (unsigned i = 0; i < sizeof(capabilities) / sizeof(capabilities[0]); i++) {
    const cw_matter_cluster_t cluster = cw_matter_map_capability(capabilities[i]);
    printf("  %s -> %s.%s\n", capabilities[i].key, cluster.cluster, cluster.primary);
  }
}

static void commission(const char *label, unsigned loss_percent, unsigned seed,
                       unsigned max_retries) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, loss_percent, seed);
  cw_matter_session_t session;
  cw_matter_session_init(&session, "smart_thermostat");

  const cw_status_t status = cw_matter_commission(&session, &transport, max_retries);
  printf("%s (%u%% loss): %s\n", label, loss_percent,
         status == CW_OK ? "commissioned" : "failed");
  printf("  steps %u/%u, retries %u, messages sent %u, dropped %u\n", session.steps_completed,
         session.steps_total, session.retries_used, transport.sent, transport.dropped);
}

int main(void) {
  print_clusters();
  printf("\n");
  commission("lossy link", 40, 2026, 10);
  commission("dead link", 100, 1, 3);
  return 0;
}
