// Dependency-free unit tests for the SDK and HAL. Each CHECK records a result; the
// process exits non-zero if any check fails, so the test runner needs no framework.

#include "openhome/hal.h"
#include "openhome/sdk.h"

#include <stdio.h>
#include <string.h>

static int g_checks = 0;
static int g_failures = 0;

#define CHECK(cond)                                                       \
  do {                                                                    \
    g_checks++;                                                           \
    if (!(cond)) {                                                        \
      g_failures++;                                                       \
      fprintf(stderr, "not ok %s:%d: %s\n", __FILE__, __LINE__, #cond);   \
    }                                                                     \
  } while (0)

static float g_fake_value = 42.0f;

static oh_status_t fake_read(void *ctx, float *out_value) {
  (void)ctx;
  *out_value = g_fake_value;
  return OH_OK;
}

static int g_last_mode = -1;

static oh_status_t fake_set_mode(void *ctx, int mode) {
  (void)ctx;
  g_last_mode = mode;
  return OH_OK;
}

static void test_register_and_read_sensor(void) {
  oh_hal_reset();
  const oh_sensor_driver_t driver = {.read = fake_read, .ctx = NULL};
  CHECK(oh_hal_register_sensor("temp", "celsius", driver) == OH_OK);
  CHECK(oh_hal_sensor_count() == 1);

  float value = 0.0f;
  CHECK(oh_hal_read_sensor("temp", &value) == OH_OK);
  CHECK(value == g_fake_value);

  const char *key = NULL;
  const char *unit = NULL;
  float sampled = 0.0f;
  CHECK(oh_hal_sensor_at(0, &key, &unit, &sampled) == OH_OK);
  CHECK(key != NULL && strcmp(key, "temp") == 0);
  CHECK(unit != NULL && strcmp(unit, "celsius") == 0);
  CHECK(sampled == g_fake_value);
}

static void test_missing_lookups(void) {
  oh_hal_reset();
  float value = 0.0f;
  CHECK(oh_hal_read_sensor("nope", &value) == OH_ERR_NOT_FOUND);
  CHECK(oh_hal_set_actuator_mode("nope", 0) == OH_ERR_NOT_FOUND);
  const char *key = NULL;
  CHECK(oh_hal_sensor_at(0, &key, NULL, NULL) == OH_ERR_NOT_FOUND);
}

static void test_invalid_arguments(void) {
  oh_hal_reset();
  const oh_sensor_driver_t no_read = {.read = NULL, .ctx = NULL};
  CHECK(oh_hal_register_sensor("temp", "celsius", no_read) == OH_ERR_INVALID);
  const oh_sensor_driver_t driver = {.read = fake_read, .ctx = NULL};
  CHECK(oh_hal_register_sensor(NULL, "celsius", driver) == OH_ERR_INVALID);
  CHECK(oh_hal_read_sensor(NULL, NULL) == OH_ERR_INVALID);
}

static void test_actuator(void) {
  oh_hal_reset();
  g_last_mode = -1;
  const oh_actuator_driver_t driver = {.set_mode = fake_set_mode, .ctx = NULL};
  CHECK(oh_hal_register_actuator("hvac", driver) == OH_OK);
  CHECK(oh_hal_set_actuator_mode("hvac", 2) == OH_OK);
  CHECK(g_last_mode == 2);
}

static void test_capacity_limit(void) {
  oh_hal_reset();
  const oh_sensor_driver_t driver = {.read = fake_read, .ctx = NULL};
  oh_status_t status = OH_OK;
  for (int i = 0; i < 16; i++) {
    status = oh_hal_register_sensor("sensor", "unit", driver);
    CHECK(status == OH_OK);
  }
  CHECK(oh_hal_register_sensor("overflow", "unit", driver) == OH_ERR_CAPACITY);
  CHECK(oh_hal_sensor_count() == 16);
}

static void test_device_run_smoke(void) {
  oh_hal_reset();
  const oh_sensor_driver_t driver = {.read = fake_read, .ctx = NULL};
  CHECK(oh_hal_register_sensor("temp", "celsius", driver) == OH_OK);
  const oh_device_t device = {.name = "unit_test_device"};
  CHECK(oh_device_init(&device) == OH_OK);
  CHECK(oh_device_run(&device, 2) == OH_OK);
  CHECK(oh_device_init(NULL) == OH_ERR_INVALID);
}

int main(void) {
  test_register_and_read_sensor();
  test_missing_lookups();
  test_invalid_arguments();
  test_actuator();
  test_capacity_limit();
  test_device_run_smoke();

  fprintf(stdout, "%d checks, %d failure(s)\n", g_checks, g_failures);
  return g_failures == 0 ? 0 : 1;
}
