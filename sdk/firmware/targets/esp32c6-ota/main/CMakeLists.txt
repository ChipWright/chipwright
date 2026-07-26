# The OTA firmware component. The signing public key is baked in so the device trusts only
# builds signed by the matching private key.
idf_component_register(
    SRCS "app_main.c"
    INCLUDE_DIRS "."
    REQUIRES nvs_flash esp_wifi esp_event esp_netif esp_http_client app_update esp_partition mbedtls json)
