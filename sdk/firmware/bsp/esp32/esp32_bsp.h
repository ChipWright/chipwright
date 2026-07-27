#ifndef CHIPWRIGHT_ESP32_BSP_H
#define CHIPWRIGHT_ESP32_BSP_H

#include "chipwright/sdk.h"

// Board support package for ESP32 targets. It registers HAL drivers backed by the
// ESP-IDF on-die temperature sensor and logging peripherals. A real build requires the
// ESP-IDF toolchain; the host compile check under bsp/esp32/hostcheck verifies the
// translation logic against minimal API stubs without it.
cw_status_t cw_esp32_bsp_register(void);

#endif  // CHIPWRIGHT_ESP32_BSP_H
