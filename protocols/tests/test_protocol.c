// Dependency-free unit tests for the protocol layer: the lossy transport, capability to
// cluster mapping, and Matter commissioning under packet loss. Packet loss is seeded so
// results are deterministic and safe to run in CI.

#include "chipwright/protocol.h"

#include <stdio.h>
#include <string.h>

static int g_checks = 0;
static int g_failures = 0;

#define CHECK(cond)                                                      \
  do {                                                                   \
    g_checks++;                                                          \
    if (!(cond)) {                                                       \
      g_failures++;                                                      \
      fprintf(stderr, "not ok %s:%d: %s\n", __FILE__, __LINE__, #cond);  \
    }                                                                    \
  } while (0)

static void test_transport_lossless(void) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, 0, 1);
  for (int i = 0; i < 100; i++) {
    CHECK(cw_sim_transport_send(&transport, "x", 1) == true);
  }
  CHECK(transport.dropped == 0);
  CHECK(transport.sent == 100);
}

static void test_transport_total_loss(void) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, 100, 1);
  for (int i = 0; i < 50; i++) {
    CHECK(cw_sim_transport_send(&transport, "x", 1) == false);
  }
  CHECK(transport.dropped == 50);
}

static void test_transport_is_deterministic(void) {
  cw_sim_transport_t a;
  cw_sim_transport_t b;
  cw_sim_transport_init(&a, 50, 12345);
  cw_sim_transport_init(&b, 50, 12345);
  for (int i = 0; i < 200; i++) {
    CHECK(cw_sim_transport_send(&a, "x", 1) == cw_sim_transport_send(&b, "x", 1));
  }
  CHECK(a.dropped == b.dropped);
  CHECK(a.dropped > 0 && a.dropped < 200);
}

static void test_capability_mapping(void) {
  const cw_capability_desc_t temp = {.key = "temperature_sensor", .kind = CW_CAP_SENSOR};
  const cw_matter_cluster_t temp_cluster = cw_matter_map_capability(temp);
  CHECK(strcmp(temp_cluster.cluster, "TemperatureMeasurement") == 0);
  CHECK(strcmp(temp_cluster.primary, "MeasuredValue") == 0);

  const cw_capability_desc_t hvac = {.key = "hvac", .kind = CW_CAP_ACTUATOR};
  const cw_matter_cluster_t hvac_cluster = cw_matter_map_capability(hvac);
  CHECK(strcmp(hvac_cluster.cluster, "Thermostat") == 0);
  CHECK(strcmp(hvac_cluster.primary, "SystemMode") == 0);
}

static void test_commission_clean_link(void) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, 0, 1);
  cw_matter_session_t session;
  cw_matter_session_init(&session, "smart_thermostat");
  CHECK(cw_matter_commission(&session, &transport, 5) == CW_OK);
  CHECK(session.steps_completed == session.steps_total);
  CHECK(session.retries_used == 0);
}

static void test_commission_survives_packet_loss(void) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, 50, 777);
  cw_matter_session_t session;
  cw_matter_session_init(&session, "smart_thermostat");
  CHECK(cw_matter_commission(&session, &transport, 20) == CW_OK);
  CHECK(session.steps_completed == session.steps_total);
  CHECK(session.retries_used > 0);
}

static void test_commission_fails_on_dead_link(void) {
  cw_sim_transport_t transport;
  cw_sim_transport_init(&transport, 100, 1);
  cw_matter_session_t session;
  cw_matter_session_init(&session, "smart_thermostat");
  CHECK(cw_matter_commission(&session, &transport, 3) == CW_ERR_IO);
  CHECK(session.steps_completed == 0);
}

int main(void) {
  test_transport_lossless();
  test_transport_total_loss();
  test_transport_is_deterministic();
  test_capability_mapping();
  test_commission_clean_link();
  test_commission_survives_packet_loss();
  test_commission_fails_on_dead_link();

  fprintf(stdout, "%d checks, %d failure(s)\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
