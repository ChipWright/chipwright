#include "openhome/hal.h"

#include <string.h>

#define OH_HAL_MAX_SENSORS 16
#define OH_HAL_MAX_ACTUATORS 16

typedef struct {
  const char *key;
  const char *unit;
  oh_sensor_driver_t driver;
} sensor_entry_t;

typedef struct {
  const char *key;
  oh_actuator_driver_t driver;
} actuator_entry_t;

static sensor_entry_t g_sensors[OH_HAL_MAX_SENSORS];
static unsigned g_sensor_count;
static actuator_entry_t g_actuators[OH_HAL_MAX_ACTUATORS];
static unsigned g_actuator_count;

oh_status_t oh_hal_register_sensor(const char *key, const char *unit, oh_sensor_driver_t driver) {
  if (key == NULL || driver.read == NULL) {
    return OH_ERR_INVALID;
  }
  if (g_sensor_count >= OH_HAL_MAX_SENSORS) {
    return OH_ERR_CAPACITY;
  }
  g_sensors[g_sensor_count].key = key;
  g_sensors[g_sensor_count].unit = unit != NULL ? unit : "";
  g_sensors[g_sensor_count].driver = driver;
  g_sensor_count++;
  return OH_OK;
}

oh_status_t oh_hal_register_actuator(const char *key, oh_actuator_driver_t driver) {
  if (key == NULL || driver.set_mode == NULL) {
    return OH_ERR_INVALID;
  }
  if (g_actuator_count >= OH_HAL_MAX_ACTUATORS) {
    return OH_ERR_CAPACITY;
  }
  g_actuators[g_actuator_count].key = key;
  g_actuators[g_actuator_count].driver = driver;
  g_actuator_count++;
  return OH_OK;
}

oh_status_t oh_hal_read_sensor(const char *key, float *out_value) {
  if (key == NULL || out_value == NULL) {
    return OH_ERR_INVALID;
  }
  for (unsigned i = 0; i < g_sensor_count; i++) {
    if (strcmp(g_sensors[i].key, key) == 0) {
      return g_sensors[i].driver.read(g_sensors[i].driver.ctx, out_value);
    }
  }
  return OH_ERR_NOT_FOUND;
}

oh_status_t oh_hal_set_actuator_mode(const char *key, int mode) {
  if (key == NULL) {
    return OH_ERR_INVALID;
  }
  for (unsigned i = 0; i < g_actuator_count; i++) {
    if (strcmp(g_actuators[i].key, key) == 0) {
      return g_actuators[i].driver.set_mode(g_actuators[i].driver.ctx, mode);
    }
  }
  return OH_ERR_NOT_FOUND;
}

unsigned oh_hal_sensor_count(void) {
  return g_sensor_count;
}

oh_status_t oh_hal_sensor_at(unsigned index, const char **out_key, const char **out_unit, float *out_value) {
  if (index >= g_sensor_count) {
    return OH_ERR_NOT_FOUND;
  }
  const sensor_entry_t *entry = &g_sensors[index];
  if (out_key != NULL) {
    *out_key = entry->key;
  }
  if (out_unit != NULL) {
    *out_unit = entry->unit;
  }
  if (out_value != NULL) {
    return entry->driver.read(entry->driver.ctx, out_value);
  }
  return OH_OK;
}

void oh_hal_reset(void) {
  g_sensor_count = 0;
  g_actuator_count = 0;
}
