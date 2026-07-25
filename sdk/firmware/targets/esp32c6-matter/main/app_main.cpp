// Matter firmware for the smart_thermostat on ESP32-C6. It exposes a Matter Temperature
// Measurement endpoint whose MeasuredValue is fed from the OpenHome HAL (the chip's on-die
// temperature sensor), so the Matter device is driven by the same manifest -> generated
// interface -> SDK + HAL path the digital twin and the plain telemetry firmware use. The
// device commissions over Wi-Fi; use a Matter commissioner (chip-tool, Apple Home, etc.).

#include <esp_err.h>
#include <esp_log.h>
#include <nvs_flash.h>

#include <esp_matter.h>

#include <freertos/FreeRTOS.h>
#include <freertos/timers.h>

// The OpenHome SDK and BSP are C; wrap their headers so this C++ app links against them.
extern "C" {
#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "esp32_bsp.h"
}

static const char *TAG = "openhome.matter";

using namespace esp_matter;
using namespace esp_matter::endpoint;
using namespace chip::app::Clusters;

static uint16_t s_temperature_endpoint_id = 0;

// Pushes the latest HAL reading into the Temperature Measurement cluster. MeasuredValue is
// in hundredths of a degree Celsius. Attribute updates must run on the Matter thread, so
// the update is marshalled there.
static void report_temperature(TimerHandle_t /*timer*/) {
  float celsius = 0.0f;
  if (oh_hal_read_sensor("temperature_sensor", &celsius) != OH_OK) {
    return;
  }
  const int16_t measured = static_cast<int16_t>(celsius * 100.0f);
  chip::DeviceLayer::SystemLayer().ScheduleLambda([measured]() {
    // MeasuredValue is a nullable int16; construct a non-null value for the update.
    esp_matter_attr_val_t val = esp_matter_nullable_int16(nullable<int16_t>(measured));
    attribute::update(s_temperature_endpoint_id, TemperatureMeasurement::Id,
                      TemperatureMeasurement::Attributes::MeasuredValue::Id, &val);
  });
}

static void on_matter_event(const ChipDeviceEvent *event, intptr_t /*arg*/) {
  if (event->Type == chip::DeviceLayer::DeviceEventType::kCommissioningComplete) {
    ESP_LOGI(TAG, "commissioning complete");
  }
}

static esp_err_t on_attribute_update(attribute::callback_type_t /*type*/, uint16_t /*endpoint_id*/,
                                     uint32_t /*cluster_id*/, uint32_t /*attribute_id*/,
                                     esp_matter_attr_val_t * /*val*/, void * /*priv*/) {
  return ESP_OK;
}

static esp_err_t on_identify(identification::callback_type_t /*type*/, uint16_t /*endpoint_id*/,
                             uint8_t /*effect_id*/, uint8_t /*effect_variant*/, void * /*priv*/) {
  return ESP_OK;
}

extern "C" void app_main(void) {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ESP_ERROR_CHECK(nvs_flash_init());
  }

  // Register the on-die temperature sensor through the HAL, so the Matter cluster is fed by
  // the same path the twin uses.
  if (oh_esp32_bsp_register() != OH_OK) {
    ESP_LOGE(TAG, "failed to register board support");
    return;
  }

  node::config_t node_config;
  node_t *node = node::create(&node_config, on_attribute_update, on_identify);
  if (node == nullptr) {
    ESP_LOGE(TAG, "failed to create Matter node");
    return;
  }

  temperature_sensor::config_t temperature_config;
  endpoint_t *endpoint = temperature_sensor::create(node, &temperature_config, ENDPOINT_FLAG_NONE, nullptr);
  if (endpoint == nullptr) {
    ESP_LOGE(TAG, "failed to create temperature endpoint");
    return;
  }
  s_temperature_endpoint_id = endpoint::get_id(endpoint);

  err = esp_matter::start(on_matter_event);
  if (err != ESP_OK) {
    ESP_LOGE(TAG, "failed to start Matter: %d", err);
    return;
  }

  // Report the on-die temperature into the cluster every two seconds.
  TimerHandle_t timer = xTimerCreate("oh_temp", pdMS_TO_TICKS(2000), pdTRUE, nullptr, report_temperature);
  xTimerStart(timer, 0);

  ESP_LOGI(TAG, "openhome matter thermostat started; commission with the setup code");
}
