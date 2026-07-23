// Commissions the smart_thermostat over the simulated Matter transport, first on a lossy
// link to show it survives packet loss through retries, then on a dead link to show it
// fails cleanly. This is the Phase 2 exit criterion exercised in simulation.

#include "openhome/protocol.h"

#include <stdio.h>

static void print_clusters(void) {
  const oh_capability_desc_t capabilities[] = {
      {.key = "temperature_sensor", .kind = OH_CAP_SENSOR},
      {.key = "hvac", .kind = OH_CAP_ACTUATOR},
  };
  printf("capability to Matter cluster mapping:\n");
  for (unsigned i = 0; i < sizeof(capabilities) / sizeof(capabilities[0]); i++) {
    const oh_matter_cluster_t cluster = oh_matter_map_capability(capabilities[i]);
    printf("  %s -> %s.%s\n", capabilities[i].key, cluster.cluster, cluster.primary);
  }
}

static void commission(const char *label, unsigned loss_percent, unsigned seed,
                       unsigned max_retries) {
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, loss_percent, seed);
  oh_matter_session_t session;
  oh_matter_session_init(&session, "smart_thermostat");

  const oh_status_t status = oh_matter_commission(&session, &transport, max_retries);
  printf("%s (%u%% loss): %s\n", label, loss_percent,
         status == OH_OK ? "commissioned" : "failed");
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
