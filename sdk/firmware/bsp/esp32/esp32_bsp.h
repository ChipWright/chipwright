#ifndef OPENHOME_ESP32_BSP_H
#define OPENHOME_ESP32_BSP_H

#include "openhome/sdk.h"

// Board support package for ESP32 targets. It registers HAL drivers backed by the
// ESP-IDF ADC and logging peripherals. A real build requires the ESP-IDF toolchain;
// the host compile check under bsp/esp32/hostcheck verifies the translation logic
// against minimal API stubs without it.
oh_status_t oh_esp32_bsp_register(void);

#endif  // OPENHOME_ESP32_BSP_H
