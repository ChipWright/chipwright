#ifndef OPENHOME_HOSTCHECK_TEMPERATURE_SENSOR_H
#define OPENHOME_HOSTCHECK_TEMPERATURE_SENSOR_H

#include "esp_err.h"

// Minimal subset of the ESP-IDF on-die temperature sensor API, declared for host compile
// checking of the ESP32 BSP. These functions are not defined here; the check compiles to
// an object file only. A real firmware build links against the ESP-IDF implementation.

typedef struct temperature_sensor_obj *temperature_sensor_handle_t;

typedef struct {
  int range_min;
  int range_max;
  int clk_src;
} temperature_sensor_config_t;

#define TEMPERATURE_SENSOR_CONFIG_DEFAULT(min, max) \
  { .range_min = (min), .range_max = (max), .clk_src = 0 }

esp_err_t temperature_sensor_install(const temperature_sensor_config_t *config,
                                     temperature_sensor_handle_t *ret_handle);
esp_err_t temperature_sensor_enable(temperature_sensor_handle_t handle);
esp_err_t temperature_sensor_get_celsius(temperature_sensor_handle_t handle, float *out_celsius);

#endif  // OPENHOME_HOSTCHECK_TEMPERATURE_SENSOR_H
