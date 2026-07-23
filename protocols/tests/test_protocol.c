// Dependency-free unit tests for the protocol layer: the lossy transport, capability to
// cluster mapping, and Matter commissioning under packet loss. Packet loss is seeded so
// results are deterministic and safe to run in CI.

#include "openhome/protocol.h"

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
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, 0, 1);
  for (int i = 0; i < 100; i++) {
    CHECK(oh_sim_transport_send(&transport, "x", 1) == true);
  }
  CHECK(transport.dropped == 0);
  CHECK(transport.sent == 100);
}

static void test_transport_total_loss(void) {
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, 100, 1);
  for (int i = 0; i < 50; i++) {
    CHECK(oh_sim_transport_send(&transport, "x", 1) == false);
  }
  CHECK(transport.dropped == 50);
}

static void test_transport_is_deterministic(void) {
  oh_sim_transport_t a;
  oh_sim_transport_t b;
  oh_sim_transport_init(&a, 50, 12345);
  oh_sim_transport_init(&b, 50, 12345);
  for (int i = 0; i < 200; i++) {
    CHECK(oh_sim_transport_send(&a, "x", 1) == oh_sim_transport_send(&b, "x", 1));
  }
  CHECK(a.dropped == b.dropped);
  CHECK(a.dropped > 0 && a.dropped < 200);
}

static void test_capability_mapping(void) {
  const oh_capability_desc_t temp = {.key = "temperature_sensor", .kind = OH_CAP_SENSOR};
  const oh_matter_cluster_t temp_cluster = oh_matter_map_capability(temp);
  CHECK(strcmp(temp_cluster.cluster, "TemperatureMeasurement") == 0);
  CHECK(strcmp(temp_cluster.primary, "MeasuredValue") == 0);

  const oh_capability_desc_t hvac = {.key = "hvac", .kind = OH_CAP_ACTUATOR};
  const oh_matter_cluster_t hvac_cluster = oh_matter_map_capability(hvac);
  CHECK(strcmp(hvac_cluster.cluster, "Thermostat") == 0);
  CHECK(strcmp(hvac_cluster.primary, "SystemMode") == 0);
}

static void test_commission_clean_link(void) {
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, 0, 1);
  oh_matter_session_t session;
  oh_matter_session_init(&session, "smart_thermostat");
  CHECK(oh_matter_commission(&session, &transport, 5) == OH_OK);
  CHECK(session.steps_completed == session.steps_total);
  CHECK(session.retries_used == 0);
}

static void test_commission_survives_packet_loss(void) {
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, 50, 777);
  oh_matter_session_t session;
  oh_matter_session_init(&session, "smart_thermostat");
  CHECK(oh_matter_commission(&session, &transport, 20) == OH_OK);
  CHECK(session.steps_completed == session.steps_total);
  CHECK(session.retries_used > 0);
}

static void test_commission_fails_on_dead_link(void) {
  oh_sim_transport_t transport;
  oh_sim_transport_init(&transport, 100, 1);
  oh_matter_session_t session;
  oh_matter_session_init(&session, "smart_thermostat");
  CHECK(oh_matter_commission(&session, &transport, 3) == OH_ERR_IO);
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
