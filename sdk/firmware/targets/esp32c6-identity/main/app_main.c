// Per-device identity on the ESP32-C6. On first boot the device asks the OpenHome cloud to
// provision it: the cloud's certificate authority registers the device, mints it an Ed25519
// key pair, and returns a certificate binding the device id to its public key, signed by the
// CA. The device stores that identity in NVS so it survives a reboot, and it never leaves the
// device again. On every boot the device proves, entirely on-chip, that it holds a genuine
// CA-issued identity:
//
//   1. Its private key matches its certificate (the derived public key equals the certified
//      one).
//   2. The certificate was signed by the CA (verified against the CA public key).
//   3. It can produce signatures that verify against its certified public key.
//
// This brings the cloud's security framework (IdentityService, verifyCertificate) onto real
// silicon. mbedTLS has no EdDSA, so all Ed25519 work uses libsodium, as in the OTA target.

#include <stdbool.h>
#include <stdint.h>
#include <string.h>

#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"

#include "cJSON.h"
#include "esp_event.h"
#include "esp_http_client.h"
#include "esp_log.h"
#include "esp_mac.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "mbedtls/base64.h"
#include "nvs.h"
#include "nvs_flash.h"
#include "sodium.h"

static const char *TAG = "openhome.identity";

#define WIFI_CONNECTED_BIT BIT0
#define NVS_NAMESPACE "openhome_id"
#define NVS_KEY_IDENTITY "identity"
#define NVS_KEY_CA "ca"

static EventGroupHandle_t s_wifi_events;

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data) {
  (void)arg;
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
  strncpy((char *)config.sta.ssid, CONFIG_OH_WIFI_SSID, sizeof config.sta.ssid - 1);
  strncpy((char *)config.sta.password, CONFIG_OH_WIFI_PASSWORD, sizeof config.sta.password - 1);
  ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
  ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &config));
  ESP_ERROR_CHECK(esp_wifi_start());

  const EventBits_t bits = xEventGroupWaitBits(s_wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE,
                                               pdMS_TO_TICKS(30000));
  return (bits & WIFI_CONNECTED_BIT) ? ESP_OK : ESP_ERR_TIMEOUT;
}

// Reads an HTTP response body into a freshly allocated, null-terminated buffer the caller
// frees. The bodies here (a provisioning result, the CA key) are small, so it caps the size.
static char *read_body(esp_http_client_handle_t client) {
  const size_t cap = 4096;
  char *body = malloc(cap + 1);
  if (body == NULL) {
    return NULL;
  }
  size_t total = 0;
  while (total < cap) {
    const int read = esp_http_client_read(client, body + total, (int)(cap - total));
    if (read <= 0) {
      break;
    }
    total += (size_t)read;
  }
  body[total] = '\0';
  if (total == 0) {
    free(body);
    return NULL;
  }
  return body;
}

static char *http_get_body(const char *url) {
  esp_http_client_config_t config = {.url = url, .timeout_ms = 10000};
  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    return NULL;
  }
  char *body = NULL;
  if (esp_http_client_open(client, 0) == ESP_OK) {
    esp_http_client_fetch_headers(client);
    if (esp_http_client_get_status_code(client) == 200) {
      body = read_body(client);
    } else {
      ESP_LOGW(TAG, "GET %s -> status %d", url, esp_http_client_get_status_code(client));
    }
    esp_http_client_close(client);
  }
  esp_http_client_cleanup(client);
  return body;
}

// Posts a JSON body and returns the response body. Accepts 200 or 201 as success; other
// statuses are logged (with the body, which carries the cloud's error message) and yield NULL.
static char *http_post_json(const char *url, const char *json) {
  esp_http_client_config_t config = {.url = url, .timeout_ms = 10000, .method = HTTP_METHOD_POST};
  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (client == NULL) {
    return NULL;
  }
  esp_http_client_set_header(client, "Content-Type", "application/json");
  char *body = NULL;
  const int len = (int)strlen(json);
  if (esp_http_client_open(client, len) == ESP_OK && esp_http_client_write(client, json, len) == len) {
    esp_http_client_fetch_headers(client);
    const int status = esp_http_client_get_status_code(client);
    body = read_body(client);
    if (status != 200 && status != 201) {
      ESP_LOGW(TAG, "POST %s -> status %d: %s", url, status, body != NULL ? body : "(no body)");
      free(body);
      body = NULL;
    }
    esp_http_client_close(client);
  }
  esp_http_client_cleanup(client);
  return body;
}

// Decodes the base64 body of a PEM block and copies its last 32 bytes into out. For an
// Ed25519 SPKI public key or PKCS8 private key the raw 32-byte key (or seed) is the tail of
// the DER encoding, which is what libsodium's raw-key API needs.
static bool pem_to_raw32(const char *pem, unsigned char out[32]) {
  const char *begin = strstr(pem, "-----BEGIN");
  if (begin == NULL) {
    return false;
  }
  const char *nl = strchr(begin, '\n');
  const char *end = nl != NULL ? strstr(nl, "-----END") : NULL;
  if (nl == NULL || end == NULL) {
    return false;
  }
  char b64[512];
  size_t bl = 0;
  for (const char *p = nl + 1; p < end && bl < sizeof b64; p++) {
    const char c = *p;
    const bool is_b64 = (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') ||
                        (c >= '0' && c <= '9') || c == '+' || c == '/' || c == '=';
    if (is_b64) {
      b64[bl++] = c;
    }
  }
  unsigned char der[400];
  size_t dl = 0;
  if (mbedtls_base64_decode(der, sizeof der, &dl, (const unsigned char *)b64, bl) != 0 || dl < 32) {
    return false;
  }
  memcpy(out, der + dl - 32, 32);
  return true;
}

// Rebuilds the exact bytes the cloud signed for a certificate: JSON.stringify of
// {deviceId, publicKeyPem, issuedAt}. Only newlines in the PEM need escaping (as \n); PEM
// text otherwise contains no JSON metacharacters. Must match the cloud's certificatePayload
// byte for byte or the CA signature will not verify.
static int build_cert_payload(char *out, size_t cap, const char *device_id, const char *pub_pem,
                              long long issued_at) {
  int n = snprintf(out, cap, "{\"deviceId\":\"%s\",\"publicKeyPem\":\"", device_id);
  for (const char *p = pub_pem; *p != '\0' && (size_t)n + 2 < cap; p++) {
    if (*p == '\n') {
      out[n++] = '\\';
      out[n++] = 'n';
    } else {
      out[n++] = *p;
    }
  }
  n += snprintf(out + n, cap - (size_t)n, "\",\"issuedAt\":%lld}", issued_at);
  return n;
}

static bool nvs_get_string(nvs_handle_t handle, const char *key, char **out) {
  size_t size = 0;
  if (nvs_get_blob(handle, key, NULL, &size) != ESP_OK || size == 0) {
    return false;
  }
  char *buf = malloc(size + 1);
  if (buf == NULL) {
    return false;
  }
  if (nvs_get_blob(handle, key, buf, &size) != ESP_OK) {
    free(buf);
    return false;
  }
  buf[size] = '\0';
  *out = buf;
  return true;
}

// Provisions this device with the cloud: POST /provision to register it and receive its
// signed identity, then GET /ca for the trust root. Stores both in NVS. Returns the identity
// JSON (the caller frees it) and writes the CA PEM into *ca_out.
static char *provision(const char *base_url, const char *device_id, char **ca_out) {
  char body[128];
  snprintf(body, sizeof body, "{\"deviceId\":\"%s\",\"deviceType\":\"%s\"}", device_id,
           CONFIG_OH_DEVICE_TYPE);
  char url[192];
  snprintf(url, sizeof url, "%s/provision", base_url);
  char *response = http_post_json(url, body);
  if (response == NULL) {
    return NULL;
  }

  cJSON *root = cJSON_Parse(response);
  free(response);
  if (root == NULL) {
    ESP_LOGE(TAG, "provision response did not parse");
    return NULL;
  }
  const cJSON *identity = cJSON_GetObjectItem(root, "identity");
  char *identity_json = identity != NULL ? cJSON_PrintUnformatted(identity) : NULL;
  cJSON_Delete(root);
  if (identity_json == NULL) {
    ESP_LOGE(TAG, "provision response had no identity");
    return NULL;
  }

  snprintf(url, sizeof url, "%s/ca", base_url);
  char *ca_response = http_get_body(url);
  char *ca_pem = NULL;
  if (ca_response != NULL) {
    cJSON *ca_root = cJSON_Parse(ca_response);
    free(ca_response);
    const cJSON *pem = ca_root != NULL ? cJSON_GetObjectItem(ca_root, "caPublicKeyPem") : NULL;
    if (cJSON_IsString(pem)) {
      ca_pem = strdup(pem->valuestring);
    }
    cJSON_Delete(ca_root);
  }
  if (ca_pem == NULL) {
    ESP_LOGE(TAG, "could not fetch CA public key");
    free(identity_json);
    return NULL;
  }

  nvs_handle_t handle;
  if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle) == ESP_OK) {
    nvs_set_blob(handle, NVS_KEY_IDENTITY, identity_json, strlen(identity_json));
    nvs_set_blob(handle, NVS_KEY_CA, ca_pem, strlen(ca_pem));
    nvs_commit(handle);
    nvs_close(handle);
    ESP_LOGI(TAG, "provisioned and stored identity for %s", device_id);
  }
  *ca_out = ca_pem;
  return identity_json;
}

// Proves the stored identity on-chip. Logs each check and returns true only if all pass.
static bool verify_identity(const char *identity_json, const char *ca_pem) {
  cJSON *identity = cJSON_Parse(identity_json);
  if (identity == NULL) {
    ESP_LOGE(TAG, "stored identity did not parse");
    return false;
  }
  bool ok = false;
  const cJSON *priv = cJSON_GetObjectItem(identity, "privateKeyPem");
  const cJSON *cert = cJSON_GetObjectItem(identity, "certificate");
  const cJSON *device_id = cJSON_GetObjectItem(identity, "deviceId");
  const cJSON *cert_pub = cert != NULL ? cJSON_GetObjectItem(cert, "publicKeyPem") : NULL;
  const cJSON *cert_sig = cert != NULL ? cJSON_GetObjectItem(cert, "signature") : NULL;
  const cJSON *issued_at = cert != NULL ? cJSON_GetObjectItem(cert, "issuedAt") : NULL;
  if (!cJSON_IsString(priv) || !cJSON_IsString(cert_pub) || !cJSON_IsString(cert_sig) ||
      !cJSON_IsString(device_id) || !cJSON_IsNumber(issued_at)) {
    ESP_LOGE(TAG, "stored identity is incomplete");
    cJSON_Delete(identity);
    return false;
  }

  unsigned char seed[32];
  unsigned char cert_pub_raw[32];
  unsigned char ca_pub_raw[32];
  if (!pem_to_raw32(priv->valuestring, seed) || !pem_to_raw32(cert_pub->valuestring, cert_pub_raw) ||
      !pem_to_raw32(ca_pem, ca_pub_raw)) {
    ESP_LOGE(TAG, "could not extract raw key material");
    cJSON_Delete(identity);
    return false;
  }

  unsigned char pk[32];
  unsigned char sk[64];
  crypto_sign_seed_keypair(pk, sk, seed);

  // 1. The private key held on the device matches the certified public key.
  const bool matches = memcmp(pk, cert_pub_raw, sizeof pk) == 0;
  ESP_LOGI(TAG, "[%s] private key matches certificate: %s", matches ? "ok" : "FAIL",
           matches ? "yes" : "no");

  // 2. The certificate was signed by the CA over the exact payload the cloud signs.
  char payload[512];
  const int plen = build_cert_payload(payload, sizeof payload, device_id->valuestring,
                                      cert_pub->valuestring, (long long)issued_at->valuedouble);
  unsigned char sig[64];
  size_t sig_len = 0;
  const bool sig_ok = mbedtls_base64_decode(sig, sizeof sig, &sig_len,
                                            (const unsigned char *)cert_sig->valuestring,
                                            strlen(cert_sig->valuestring)) == 0 &&
                      sig_len == 64;
  const bool ca_signed = sig_ok && crypto_sign_verify_detached(sig, (const unsigned char *)payload,
                                                               (size_t)plen, ca_pub_raw) == 0;
  ESP_LOGI(TAG, "[%s] certificate signed by CA: %s", ca_signed ? "ok" : "FAIL",
           ca_signed ? "yes" : "no");

  // 3. The device can produce a signature that verifies against its certified key.
  unsigned char nonce[32];
  randombytes_buf(nonce, sizeof nonce);
  unsigned char proof[64];
  crypto_sign_detached(proof, NULL, nonce, sizeof nonce, sk);
  const bool can_sign =
      crypto_sign_verify_detached(proof, nonce, sizeof nonce, cert_pub_raw) == 0;
  ESP_LOGI(TAG, "[%s] produces valid signatures: %s", can_sign ? "ok" : "FAIL",
           can_sign ? "yes" : "no");

  ok = matches && ca_signed && can_sign;
  cJSON_Delete(identity);
  return ok;
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

  unsigned char mac[6];
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char device_id[32];
  snprintf(device_id, sizeof device_id, "esp32c6-%02x%02x%02x%02x%02x%02x", mac[0], mac[1], mac[2],
           mac[3], mac[4], mac[5]);
  ESP_LOGI(TAG, "device id %s", device_id);

  // Load a previously provisioned identity from NVS; only reach out to the cloud on first
  // boot. This is what makes the identity durable: a reboot reuses the same certificate.
  char *identity_json = NULL;
  char *ca_pem = NULL;
  nvs_handle_t handle;
  bool have_identity = false;
  if (nvs_open(NVS_NAMESPACE, NVS_READONLY, &handle) == ESP_OK) {
    have_identity = nvs_get_string(handle, NVS_KEY_IDENTITY, &identity_json) &&
                    nvs_get_string(handle, NVS_KEY_CA, &ca_pem);
    nvs_close(handle);
  }

  if (have_identity) {
    ESP_LOGI(TAG, "loaded existing identity from NVS");
  } else {
    ESP_LOGI(TAG, "no stored identity; provisioning with the cloud");
    if (wifi_connect() != ESP_OK) {
      ESP_LOGE(TAG, "wifi connect failed; cannot provision");
      return;
    }
    identity_json = provision(CONFIG_OH_CLOUD_URL, device_id, &ca_pem);
    if (identity_json == NULL) {
      ESP_LOGE(TAG, "provisioning failed");
      return;
    }
  }

  const bool verified = verify_identity(identity_json, ca_pem);
  free(identity_json);
  free(ca_pem);

  for (;;) {
    ESP_LOGI(TAG, "identity %s: %s", device_id,
             verified ? "VERIFIED (CA-issued, key on device, persisted)" : "NOT VERIFIED");
    vTaskDelay(pdMS_TO_TICKS(5000));
  }
}
