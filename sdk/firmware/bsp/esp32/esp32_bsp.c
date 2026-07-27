#include "esp32_bsp.h"

#include "chipwright/hal.h"

#include "driver/gpio.h"
#include "driver/temperature_sensor.h"
#include "esp_log.h"

static const char *TAG = "chipwright.esp32";

// The ESP32-C6 (and other recent ESP32 parts) has an on-die temperature sensor, so the
// reference board proves the telemetry path on real silicon with no external sensor wired.
static temperature_sensor_handle_t g_temp_sensor;

// The HVAC actuator drives a plain GPIO so a mode change is a measurable electrical output on
// the board, not just a log line. GPIO10 is broken out on the C6-DevKitC-1 and is not a
// strapping pin. Any non-off mode asserts the line; off deasserts it.
#define CW_HVAC_GPIO GPIO_NUM_10

static cw_status_t esp32_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  // The C6 on-die sensor reads in roughly whole-degree steps and is stable between reads,
  // so its effective resolution here is about 1 C. An external I2C sensor is the path to
  // finer room-temperature readings (see the hardware plan).
  float celsius = 0.0f;
  if (temperature_sensor_get_celsius(g_temp_sensor, &celsius) != ESP_OK) {
    return CW_ERR_IO;
  }
  *out_value = celsius;
  return CW_OK;
}

static cw_status_t esp32_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  if (gpio_set_level(CW_HVAC_GPIO, mode != 0 ? 1 : 0) != ESP_OK) {
    return CW_ERR_IO;
  }
  ESP_LOGI(TAG, "hvac mode set to %d (gpio%d %s)", mode, CW_HVAC_GPIO,
           mode != 0 ? "high" : "low");
  return CW_OK;
}

cw_status_t cw_esp32_bsp_register(void) {
  const temperature_sensor_config_t config = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
  if (temperature_sensor_install(&config, &g_temp_sensor) != ESP_OK) {
    return CW_ERR_IO;
  }
  if (temperature_sensor_enable(g_temp_sensor) != ESP_OK) {
    return CW_ERR_IO;
  }

  const cw_sensor_driver_t temperature = {.read = esp32_temperature_read, .ctx = NULL};
  const cw_status_t status = cw_hal_register_sensor("temperature_sensor", "celsius", temperature);
  if (status != CW_OK) {
    return status;
  }

  const gpio_config_t hvac_gpio = {
      .pin_bit_mask = 1ULL << CW_HVAC_GPIO,
      .mode = GPIO_MODE_OUTPUT,
      .pull_up_en = GPIO_PULLUP_DISABLE,
      .pull_down_en = GPIO_PULLDOWN_DISABLE,
      .intr_type = GPIO_INTR_DISABLE,
  };
  if (gpio_config(&hvac_gpio) != ESP_OK) {
    return CW_ERR_IO;
  }
  gpio_set_level(CW_HVAC_GPIO, 0);

  const cw_actuator_driver_t hvac = {.set_mode = esp32_hvac_set_mode, .ctx = NULL};
  return cw_hal_register_actuator("hvac", hvac);
}
