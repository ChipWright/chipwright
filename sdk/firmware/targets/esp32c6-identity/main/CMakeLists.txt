# The identity firmware component. Ed25519 provisioning and verification use libsodium
# (mbedTLS has no EdDSA); base64 decoding of PEM key material uses mbedTLS.
idf_component_register(
    SRCS "app_main.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash esp_wifi esp_event esp_netif esp_http_client esp_hw_support mbedtls json)
