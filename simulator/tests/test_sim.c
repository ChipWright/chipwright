// Dependency-free unit tests for the simulator: signal source, fault injection, and
// telemetry capture through the twin runtime.

#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "openhome/sim.h"

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

static void test_source_advances(void) {
  oh_sim_source_t source;
  oh_sim_source_init(&source, 20.0f, 0.5f);
  const oh_sensor_driver_t driver = oh_sim_source_driver(&source);
  float value = 0.0f;
  CHECK(driver.read(driver.ctx, &value) == OH_OK);
  CHECK(value == 20.5f);
  CHECK(driver.read(driver.ctx, &value) == OH_OK);
  CHECK(value == 21.0f);
}

static void test_fault_none_passthrough(void) {
  oh_sim_source_t source;
  oh_sim_source_init(&source, 10.0f, 1.0f);
  oh_fault_sensor_t sensor;
  oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));
  const oh_sensor_driver_t driver = oh_fault_sensor_driver(&sensor);
  float value = 0.0f;
  CHECK(driver.read(driver.ctx, &value) == OH_OK);
  CHECK(value == 11.0f);
}

static void test_fault_offset(void) {
  oh_sim_source_t source;
  oh_sim_source_init(&source, 0.0f, 0.0f);
  oh_fault_sensor_t sensor;
  oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));
  const oh_fault_config_t fault = {.kind = OH_FAULT_OFFSET, .offset = 5.0f};
  oh_fault_sensor_set(&sensor, fault);
  const oh_sensor_driver_t driver = oh_fault_sensor_driver(&sensor);
  float value = 0.0f;
  CHECK(driver.read(driver.ctx, &value) == OH_OK);
  CHECK(value == 5.0f);
}

static void test_fault_stuck_freezes(void) {
  oh_sim_source_t source;
  oh_sim_source_init(&source, 0.0f, 1.0f);
  oh_fault_sensor_t sensor;
  oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));
  const oh_sensor_driver_t driver = oh_fault_sensor_driver(&sensor);

  float first = 0.0f;
  CHECK(driver.read(driver.ctx, &first) == OH_OK);
  CHECK(first == 1.0f);

  const oh_fault_config_t stuck = {.kind = OH_FAULT_STUCK, .offset = 0.0f};
  oh_fault_sensor_set(&sensor, stuck);
  float frozen = 0.0f;
  CHECK(driver.read(driver.ctx, &frozen) == OH_OK);
  CHECK(frozen == first);
  CHECK(driver.read(driver.ctx, &frozen) == OH_OK);
  CHECK(frozen == first);
}

static void test_fault_fail_reports_io(void) {
  oh_sim_source_t source;
  oh_sim_source_init(&source, 0.0f, 1.0f);
  oh_fault_sensor_t sensor;
  oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));
  const oh_fault_config_t fail = {.kind = OH_FAULT_FAIL, .offset = 0.0f};
  oh_fault_sensor_set(&sensor, fail);
  const oh_sensor_driver_t driver = oh_fault_sensor_driver(&sensor);
  float value = 0.0f;
  CHECK(driver.read(driver.ctx, &value) == OH_ERR_IO);
}

static oh_sim_source_t g_twin_source;
static oh_fault_sensor_t g_twin_sensor;

static void register_twin_sensor(void) {
  oh_hal_reset();
  oh_sim_source_init(&g_twin_source, 21.0f, 0.5f);
  oh_fault_sensor_init(&g_twin_sensor, oh_sim_source_driver(&g_twin_source));
  oh_hal_register_sensor("temperature_sensor", "celsius", oh_fault_sensor_driver(&g_twin_sensor));
}

static void test_twin_captures_telemetry(void) {
  register_twin_sensor();
  const oh_device_t device = {.name = "twin"};
  oh_twin_capture_t capture;
  oh_twin_capture_reset(&capture);

  CHECK(oh_twin_run(&device, 3, &capture) == OH_OK);
  CHECK(capture.count == 3);
  CHECK(capture.overflow == false);
  CHECK(capture.samples[0].metric != NULL);
  CHECK(strcmp(capture.samples[0].metric, "temperature_sensor") == 0);
  CHECK(capture.samples[0].value == 21.5f);
  CHECK(capture.samples[2].value == 22.5f);
}

static void test_twin_skips_failed_reads(void) {
  register_twin_sensor();
  const oh_fault_config_t fail = {.kind = OH_FAULT_FAIL, .offset = 0.0f};
  oh_fault_sensor_set(&g_twin_sensor, fail);
  const oh_device_t device = {.name = "twin"};
  oh_twin_capture_t capture;
  oh_twin_capture_reset(&capture);

  CHECK(oh_twin_run(&device, 4, &capture) == OH_OK);
  CHECK(capture.count == 0);
}

static void test_twin_commission_survives_loss(void) {
  oh_twin_network_t network;
  oh_twin_network_init(&network, 50, 777);
  oh_matter_session_t session;
  CHECK(oh_twin_commission(&network, "twin", 20, &session) == OH_OK);
  CHECK(session.steps_completed == session.steps_total);
}

static void test_twin_networked_lossless_uplink(void) {
  register_twin_sensor();
  oh_twin_network_t network;
  oh_twin_network_init(&network, 0, 1);
  const oh_device_t device = {.name = "twin"};
  oh_twin_capture_t capture;
  oh_twin_capture_reset(&capture);

  CHECK(oh_twin_run_networked(&device, 5, &capture, &network) == OH_OK);
  CHECK(capture.count == 5);
  CHECK(network.telemetry_uplinked == 5);
  CHECK(network.telemetry_dropped == 0);
}

static void test_twin_networked_lossy_uplink(void) {
  register_twin_sensor();
  oh_twin_network_t network;
  oh_twin_network_init(&network, 100, 1);
  const oh_device_t device = {.name = "twin"};
  oh_twin_capture_t capture;
  oh_twin_capture_reset(&capture);

  CHECK(oh_twin_run_networked(&device, 5, &capture, &network) == OH_OK);
  // Every emitted sample is captured locally, but none reach the cloud over a dead link.
  CHECK(capture.count == 5);
  CHECK(network.telemetry_uplinked == 0);
  CHECK(network.telemetry_dropped == 5);
  CHECK(network.telemetry_uplinked + network.telemetry_dropped == capture.count);
}

// Records the mode applied to a fake actuator, so command parsing can be verified without a
// physical driver.
static int g_command_mode = -777;

static oh_status_t command_actuator_set(void *ctx, int mode) {
  (void)ctx;
  g_command_mode = mode;
  return OH_OK;
}

static void test_command_apply(void) {
  oh_hal_reset();
  const oh_actuator_driver_t hvac = {.set_mode = command_actuator_set, .ctx = NULL};
  oh_hal_register_actuator("hvac", hvac);

  CHECK(oh_command_apply("command key=hvac mode=1") == OH_OK);
  CHECK(g_command_mode == 1);
  CHECK(oh_command_apply("command key=hvac mode=0") == OH_OK);
  CHECK(g_command_mode == 0);

  // An unknown actuator reports not-found; the fake driver is left untouched.
  CHECK(oh_command_apply("command key=no_such_actuator mode=1") == OH_ERR_NOT_FOUND);
  CHECK(g_command_mode == 0);

  // Malformed and null lines are rejected without touching the actuator.
  CHECK(oh_command_apply("telemetry metric=temperature_sensor value=21") == OH_ERR_INVALID);
  CHECK(oh_command_apply("garbage") == OH_ERR_INVALID);
  CHECK(oh_command_apply(NULL) == OH_ERR_INVALID);
  CHECK(g_command_mode == 0);
}

int main(void) {
  test_source_advances();
  test_fault_none_passthrough();
  test_fault_offset();
  test_fault_stuck_freezes();
  test_fault_fail_reports_io();
  test_twin_captures_telemetry();
  test_twin_skips_failed_reads();
  test_twin_commission_survives_loss();
  test_twin_networked_lossless_uplink();
  test_twin_networked_lossy_uplink();
  test_command_apply();

  fprintf(stdout, "%d checks, %d failure(s)\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
