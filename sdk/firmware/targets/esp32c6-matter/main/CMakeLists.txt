# The firmware component: the Matter app entry plus the portable Chipwright SDK core and the
# ESP32 BSP (on-die temperature sensor), referenced from the shared firmware tree so the
# Matter device runs the same code the twin and plain telemetry firmware do.
idf_component_register(
    SRCS "app_main.cpp"
         "../../../src/hal.c"
         "../../../src/sdk.c"
         "../../../src/log.c"
         "../../../bsp/esp32/esp32_bsp.c"
    PRIV_INCLUDE_DIRS "." "../../../include" "../../../bsp/esp32"
    PRIV_REQUIRES driver nvs_flash esp_matter)

target_compile_options(${COMPONENT_LIB} PRIVATE "-DCHIP_HAVE_CONFIG_H")
