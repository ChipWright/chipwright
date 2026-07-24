#include "esp32_bsp.h"

#include "openhome/hal.h"

#include "driver/temperature_sensor.h"
#include "esp_log.h"

static const char *TAG = "openhome.esp32";

// The ESP32-C6 (and other recent ESP32 parts) has an on-die temperature sensor, so the
// reference board proves the telemetry path on real silicon with no external sensor wired.
static temperature_sensor_handle_t g_temp_sensor;

static oh_status_t esp32_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  // The C6 on-die sensor reads in roughly whole-degree steps and is stable between reads,
  // so its effective resolution here is about 1 C. An external I2C sensor is the path to
  // finer room-temperature readings (see the hardware plan).
  float celsius = 0.0f;
  if (temperature_sensor_get_celsius(g_temp_sensor, &celsius) != ESP_OK) {
    return OH_ERR_IO;
  }
  *out_value = celsius;
  return OH_OK;
}

static oh_status_t esp32_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  ESP_LOGI(TAG, "hvac mode set to %d", mode);
  return OH_OK;
}

oh_status_t oh_esp32_bsp_register(void) {
  const temperature_sensor_config_t config = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
  if (temperature_sensor_install(&config, &g_temp_sensor) != ESP_OK) {
    return OH_ERR_IO;
  }
  if (temperature_sensor_enable(g_temp_sensor) != ESP_OK) {
    return OH_ERR_IO;
  }

  const oh_sensor_driver_t temperature = {.read = esp32_temperature_read, .ctx = NULL};
  const oh_status_t status = oh_hal_register_sensor("temperature_sensor", "celsius", temperature);
  if (status != OH_OK) {
    return status;
  }

  const oh_actuator_driver_t hvac = {.set_mode = esp32_hvac_set_mode, .ctx = NULL};
  return oh_hal_register_actuator("hvac", hvac);
}
