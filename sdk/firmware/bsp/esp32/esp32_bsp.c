#include "esp32_bsp.h"

#include "openhome/hal.h"

#include "esp_adc/adc_oneshot.h"
#include "esp_log.h"

static const char *TAG = "openhome.esp32";

// ADC unit and channel wired to the temperature sensor on the reference board.
#define OH_ESP32_TEMP_ADC_UNIT ADC_UNIT_1
#define OH_ESP32_TEMP_ADC_CHANNEL ADC_CHANNEL_0
#define OH_ESP32_ADC_MAX_RAW 4095.0f

static adc_oneshot_unit_handle_t g_adc_handle;

static oh_status_t esp32_temperature_read(void *ctx, float *out_value) {
  (void)ctx;
  int raw = 0;
  if (adc_oneshot_read(g_adc_handle, OH_ESP32_TEMP_ADC_CHANNEL, &raw) != ESP_OK) {
    return OH_ERR_IO;
  }
  // Linear approximation from the 12-bit ADC reading to a -20..80 celsius span. Real
  // boards calibrate against the sensor datasheet; this is the reference-board mapping.
  *out_value = (raw / OH_ESP32_ADC_MAX_RAW) * 100.0f - 20.0f;
  return OH_OK;
}

static oh_status_t esp32_hvac_set_mode(void *ctx, int mode) {
  (void)ctx;
  ESP_LOGI(TAG, "hvac mode set to %d", mode);
  return OH_OK;
}

oh_status_t oh_esp32_bsp_register(void) {
  const adc_oneshot_unit_init_cfg_t init_cfg = {.unit_id = OH_ESP32_TEMP_ADC_UNIT};
  if (adc_oneshot_new_unit(&init_cfg, &g_adc_handle) != ESP_OK) {
    return OH_ERR_IO;
  }
  const adc_oneshot_chan_cfg_t chan_cfg = {
      .atten = ADC_ATTEN_DB_12,
      .bitwidth = ADC_BITWIDTH_DEFAULT,
  };
  if (adc_oneshot_config_channel(g_adc_handle, OH_ESP32_TEMP_ADC_CHANNEL, &chan_cfg) != ESP_OK) {
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
