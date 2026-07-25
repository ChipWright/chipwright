# The firmware component: the app entry, the portable SDK core, and the ESP32 BSP. The SDK
# and BSP sources live in the shared firmware tree and are referenced by relative path, so
# real silicon builds from the same code the twin runs.
idf_component_register(
  SRCS
    "app_main.c"
    "../../../src/hal.c"
    "../../../src/sdk.c"
    "../../../src/command.c"
    "../../../src/log.c"
    "../../../bsp/esp32/esp32_bsp.c"
  INCLUDE_DIRS
    "."
    "../../../include"
    "../../../bsp/esp32"
  REQUIRES driver esp_driver_usb_serial_jtag
)
