// On-device OTA for the smart_thermostat on ESP32-C6. The device polls the Chipwright cloud for
// the newest published firmware, downloads it into the inactive OTA slot, verifies the
// artifact's SHA-256 and the cloud's Ed25519 signature against a baked-in public key, and only
// then switches to it. A freshly applied image boots as pending-verify and must pass a
// self-test to become permanent; otherwise the bootloader rolls back to the previous image.
//
// This closes the platform's own update loop on real silicon: the same signed-build pipeline
// proven in the cloud tests (FirmwareStore + signing + rollout) now delivers to a chip.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#include "cJSON.h"
#include "esp_app_desc.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_ota_ops.h"
#include "esp_wifi.h"
#include "mbedtls/base64.h"
#include "mbedtls/sha256.h"
#include "nvs_flash.h"
#include "sodium.h"

#include "signing_public_key.h"

static const char *TAG = "chipwright.ota";

#define CW_DEVICE_TYPE "smart_thermostat"
#define WIFI_CONNECTED_BIT BIT0

static EventGroupHandle_t s_wifi_events;

// Compares two dotted numeric versions. Returns >0 when a is newer than b. Mirrors the cloud's
// compareVersions so the device and cloud agree on which build is newer.
static int compare_versions(const char *a, const char *b) {
  while (*a || *b) {
    int an = 0;
    int bn = 0;
    while (*a && *a != '.') {
      an = an * 10 + (*a++ - '0');
    }
    while (*b && *b != '.') {
      bn = bn * 10 + (*b++ - '0');
    }
    if (an != bn) {
      return an - bn;
    }
    if (*a == '.') {
      a++;
    }
    if (*b == '.') {
      b++;
    }
  }
  return 0;
}

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
  (void)data;
  if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
    esp_wifi_connect();
  } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
    ESP_LOGW(TAG, "wifi disconnected, retrying");
    esp_wifi_connect();
  } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
    const ip_event_got_ip_t *event = (const ip_event_got_ip_t *)data;
    ESP_LOGI(TAG, "got ip " IPSTR, IP2STR(&event->ip_info.ip));
    xEventGroupSetBits(s_wifi_events, WIFI_CONNECTED_BIT);
  }
}

static esp_err_t wifi_connect(void) {
  s_wifi_events = xEventGroupCreate();
  ESP_ERROR_CHECK(esp_netif_init());
  ESP_ERROR_CHECK(esp_event_loop_create_default());
  esp_netif_create_default_wifi_sta();

  wifi_init_config_t init = WIFI_INIT_CONFIG_DEFAULT();
  ESP_ERROR_CHECK(esp_wifi_init(&init));
  ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
  ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));

  wifi_config_t config = {0};
  strncpy((char *)config.sta.ssid, CONFIG_CW_WIFI_SSID, sizeof config.sta.ssid - 1);
  strncpy((char *)config.sta.password, CONFIG_CW_WIFI_PASSWORD, sizeof config.sta.password - 1);
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
  ESP_ERROR_CHECK(esp_wifi_start());

  const EventBits_t bits = xEventGroupWaitBits(s_wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE,
                                               pdMS_TO_TICKS(30000));
  return (bits & WIFI_CONNECTED_BIT) ? ESP_OK : ESP_ERR_TIMEOUT;
}

// Performs a simple GET and returns the response body in a freshly allocated, null-terminated
// buffer the caller frees. Intended for the small JSON manifest, so it caps the body size.
static char *http_get_body(const char *url) {
  esp_http_client_config_t config = {.url = url, .timeout_ms = 10000};
  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    return NULL;
  }
  char *body = NULL;
  const esp_err_t open_err = esp_http_client_open(client, 0);
  if (open_err != ESP_OK) {
    ESP_LOGW(TAG, "http open failed for %s: %s", url, esp_err_to_name(open_err));
    esp_http_client_cleanup(client);
    return NULL;
  }
  // The response may be chunked (no Content-Length), so read until the transfer completes
  // rather than trusting the header length. The manifest is small, so cap the buffer.
  esp_http_client_fetch_headers(client);
  const int status = esp_http_client_get_status_code(client);
  if (status != 200) {
    ESP_LOGW(TAG, "http GET %s: status %d", url, status);
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return NULL;
  }
  const size_t cap = 4096;
  body = malloc(cap + 1);
  if (body != NULL) {
    size_t total = 0;
    while (total < cap) {
      const int read = esp_http_client_read(client, body + total, (int)(cap - total));
      if (read <= 0) {
        break;
      }
      total += (size_t)read;
    }
    if (total > 0) {
      body[total] = '\0';
    } else {
      free(body);
      body = NULL;
    }
  }
  esp_http_client_close(client);
  esp_http_client_cleanup(client);
  return body;
}

// Downloads the artifact into the inactive OTA slot while hashing it, then verifies the hash
// and the Ed25519 signature before switching the boot partition. Returns ESP_OK only when a
// verified image has been staged; the caller then reboots into it.
static esp_err_t download_and_verify(const char *base_url, const char *version,
                                     const char *expected_sha_hex, const char *signature_b64) {
  char url[256];
  snprintf(url, sizeof url, "%s/firmware/%s/%s/artifact", base_url, CW_DEVICE_TYPE, version);

  const esp_partition_t *target = esp_ota_get_next_update_partition(NULL);
  if (target == NULL) {
    ESP_LOGE(TAG, "no OTA partition available");
    return ESP_FAIL;
  }

  esp_http_client_config_t config = {.url = url, .timeout_ms = 15000};
  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    return ESP_FAIL;
  }
  if (esp_http_client_open(client, 0) != ESP_OK) {
    esp_http_client_cleanup(client);
    return ESP_FAIL;
  }
  esp_http_client_fetch_headers(client);
  if (esp_http_client_get_status_code(client) != 200) {
    ESP_LOGE(TAG, "artifact download failed (status %d)",
             esp_http_client_get_status_code(client));
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return ESP_FAIL;
  }

  esp_ota_handle_t ota = 0;
  if (esp_ota_begin(target, OTA_SIZE_UNKNOWN, &ota) != ESP_OK) {
    esp_http_client_close(client);
    esp_http_client_cleanup(client);
    return ESP_FAIL;
  }

  mbedtls_sha256_context sha;
  mbedtls_sha256_init(&sha);
  mbedtls_sha256_starts(&sha, 0);

  // Stream the (possibly chunked) body into the OTA slot until the transfer completes,
  // hashing as we go.
  esp_err_t result = ESP_OK;
  char buf[1024];
  int total = 0;
  while (true) {
    const int read = esp_http_client_read(client, buf, sizeof buf);
    if (read < 0) {
      result = ESP_FAIL;
      break;
    }
    if (read == 0) {
      break;
    }
    mbedtls_sha256_update(&sha, (const unsigned char *)buf, (size_t)read);
    if (esp_ota_write(ota, buf, (size_t)read) != ESP_OK) {
      result = ESP_FAIL;
      break;
    }
    total += read;
  }
  const bool complete = esp_http_client_is_complete_data_received(client);
  esp_http_client_close(client);
  esp_http_client_cleanup(client);

  unsigned char digest[32];
  mbedtls_sha256_finish(&sha, digest);
  mbedtls_sha256_free(&sha);

  if (result != ESP_OK || !complete || total == 0) {
    ESP_LOGE(TAG, "download incomplete (%d bytes, complete=%d)", total, complete);
    esp_ota_abort(ota);
    return ESP_FAIL;
  }
  ESP_LOGI(TAG, "downloaded %d bytes", total);

  // Integrity: the downloaded bytes must hash to the value in the signed manifest.
  char digest_hex[65];
  for (int i = 0; i < 32; i++) {
    snprintf(digest_hex + i * 2, 3, "%02x", digest[i]);
  }
  if (strcmp(digest_hex, expected_sha_hex) != 0) {
    ESP_LOGE(TAG, "sha256 mismatch: computed %s, expected %s", digest_hex, expected_sha_hex);
    esp_ota_abort(ota);
    return ESP_FAIL;
  }

  // Authenticity: the manifest signature must verify against the baked-in key. The signed
  // payload is the exact JSON the cloud signs, with fields in this order and no whitespace.
  char payload[256];
  const int payload_len = snprintf(payload, sizeof payload,
                                   "{\"deviceType\":\"%s\",\"version\":\"%s\",\"artifactSha256\":\"%s\"}",
                                   CW_DEVICE_TYPE, version, expected_sha_hex);
  unsigned char signature[64];
  size_t sig_len = 0;
  if (mbedtls_base64_decode(signature, sizeof signature, &sig_len,
                            (const unsigned char *)signature_b64, strlen(signature_b64)) != 0 ||
      sig_len != 64) {
    ESP_LOGE(TAG, "malformed signature");
    esp_ota_abort(ota);
    return ESP_FAIL;
  }
  if (crypto_sign_verify_detached(signature, (const unsigned char *)payload, (size_t)payload_len,
                                  CW_SIGNING_PUBLIC_KEY) != 0) {
    ESP_LOGE(TAG, "signature verification FAILED; rejecting image");
    esp_ota_abort(ota);
    return ESP_FAIL;
  }

  if (esp_ota_end(ota) != ESP_OK) {
    ESP_LOGE(TAG, "esp_ota_end failed (invalid image)");
    return ESP_FAIL;
  }
  if (esp_ota_set_boot_partition(target) != ESP_OK) {
    ESP_LOGE(TAG, "failed to set boot partition");
    return ESP_FAIL;
  }
  ESP_LOGI(TAG, "verified %s@%s staged to %s; rebooting", CW_DEVICE_TYPE, version, target->label);
  return ESP_OK;
}

// Checks the cloud for a newer build and, if one verifies, stages it and reboots.
static void check_for_update(const char *base_url, const char *running_version) {
  char url[256];
  snprintf(url, sizeof url, "%s/firmware/%s/latest", base_url, CW_DEVICE_TYPE);
  char *body = http_get_body(url);
  if (body == NULL) {
    ESP_LOGW(TAG, "no manifest available from %s", url);
    return;
  }

  cJSON *root = cJSON_Parse(body);
  free(body);
  if (root == NULL) {
    ESP_LOGW(TAG, "manifest parse failed");
    return;
  }
  const cJSON *version = cJSON_GetObjectItem(root, "version");
  const cJSON *sha = cJSON_GetObjectItem(root, "artifactSha256");
  const cJSON *signature = cJSON_GetObjectItem(root, "signature");
  if (cJSON_IsString(version) && cJSON_IsString(sha) && cJSON_IsString(signature)) {
    if (compare_versions(version->valuestring, running_version) > 0) {
      ESP_LOGI(TAG, "update available: %s (running %s)", version->valuestring, running_version);
      if (download_and_verify(base_url, version->valuestring, sha->valuestring,
                              signature->valuestring) == ESP_OK) {
        cJSON_Delete(root);
        esp_restart();
      }
    } else {
      ESP_LOGI(TAG, "up to date at %s (latest %s)", running_version, version->valuestring);
    }
  }
  cJSON_Delete(root);
}

// Confirms a freshly applied image or triggers rollback. On first boot after an update the
// running partition is in the pending-verify state; a passing self-test makes it permanent,
// a failing one reverts to the previous image.
static void confirm_or_rollback(void) {
  const esp_partition_t *running = esp_ota_get_running_partition();
  esp_ota_img_states_t state;
  if (esp_ota_get_state_partition(running, &state) != ESP_OK ||
      state != ESP_OTA_IMG_PENDING_VERIFY) {
    return;
  }
#if CONFIG_CW_OTA_SELFTEST_FAIL
  const bool self_test_ok = false;
#else
  const bool self_test_ok = true;
#endif
  if (self_test_ok) {
    esp_ota_mark_app_valid_cancel_rollback();
    ESP_LOGI(TAG, "self-test passed; image confirmed");
  } else {
    ESP_LOGE(TAG, "self-test FAILED; rolling back to previous image");
    esp_ota_mark_app_invalid_rollback_and_reboot();
  }
}

void app_main(void) {
  esp_err_t err = nvs_flash_init();
  if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
    ESP_ERROR_CHECK(nvs_flash_erase());
    ESP_ERROR_CHECK(nvs_flash_init());
  }

  if (sodium_init() < 0) {
    ESP_LOGE(TAG, "libsodium init failed");
    return;
  }

  const esp_app_desc_t *app = esp_app_get_description();
  const esp_partition_t *running = esp_ota_get_running_partition();
  ESP_LOGI(TAG, "booted %s@%s from partition %s", CW_DEVICE_TYPE, app->version, running->label);

  confirm_or_rollback();

  if (wifi_connect() != ESP_OK) {
    ESP_LOGE(TAG, "wifi connect failed; cannot check for updates");
  } else {
    check_for_update(CONFIG_CW_OTA_CLOUD_URL, app->version);
  }

  // Report the running version periodically so the update or rollback is observable on the
  // serial console.
  for (;;) {
    ESP_LOGI(TAG, "running %s@%s on %s", CW_DEVICE_TYPE, app->version, running->label);
    vTaskDelay(pdMS_TO_TICKS(5000));
  }
}
