#ifndef OPENHOME_HOSTCHECK_GPIO_H
#define OPENHOME_HOSTCHECK_GPIO_H

#include <stdint.h>

#include "esp_err.h"

// Minimal subset of the ESP-IDF GPIO API, declared for host compile checking of the ESP32
// BSP. These functions are not defined here; the check compiles to an object file only. A
// real firmware build links against the ESP-IDF implementation.

typedef int gpio_num_t;
#define GPIO_NUM_10 10

typedef enum {
  GPIO_MODE_DISABLE = 0,
  GPIO_MODE_INPUT,
  GPIO_MODE_OUTPUT,
} gpio_mode_t;

typedef enum {
  GPIO_PULLUP_DISABLE = 0,
  GPIO_PULLUP_ENABLE,
} gpio_pullup_t;

typedef enum {
  GPIO_PULLDOWN_DISABLE = 0,
  GPIO_PULLDOWN_ENABLE,
} gpio_pulldown_t;

typedef enum {
  GPIO_INTR_DISABLE = 0,
} gpio_int_type_t;

typedef struct {
  uint64_t pin_bit_mask;
  gpio_mode_t mode;
  gpio_pullup_t pull_up_en;
  gpio_pulldown_t pull_down_en;
  gpio_int_type_t intr_type;
} gpio_config_t;

esp_err_t gpio_config(const gpio_config_t *config);
esp_err_t gpio_set_level(gpio_num_t gpio_num, uint32_t level);

#endif  // OPENHOME_HOSTCHECK_GPIO_H
