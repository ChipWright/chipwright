#ifndef OPENHOME_HOSTCHECK_ADC_ONESHOT_H
#define OPENHOME_HOSTCHECK_ADC_ONESHOT_H

#include "esp_err.h"

// Minimal subset of the ESP-IDF ADC oneshot API, declared for host compile checking of
// the ESP32 BSP. These functions are not defined here; the check compiles to an object
// file only. A real firmware build links against the ESP-IDF implementation.

typedef struct adc_oneshot_unit_ctx *adc_oneshot_unit_handle_t;

typedef enum {
  ADC_UNIT_1 = 0,
  ADC_UNIT_2 = 1,
} adc_unit_t;

typedef enum {
  ADC_CHANNEL_0 = 0,
} adc_channel_t;

typedef enum {
  ADC_ATTEN_DB_12 = 3,
} adc_atten_t;

typedef enum {
  ADC_BITWIDTH_DEFAULT = 0,
} adc_bitwidth_t;

typedef struct {
  adc_unit_t unit_id;
} adc_oneshot_unit_init_cfg_t;

typedef struct {
  adc_atten_t atten;
  adc_bitwidth_t bitwidth;
} adc_oneshot_chan_cfg_t;

esp_err_t adc_oneshot_new_unit(const adc_oneshot_unit_init_cfg_t *init_config,
                               adc_oneshot_unit_handle_t *ret_unit);
esp_err_t adc_oneshot_config_channel(adc_oneshot_unit_handle_t handle, adc_channel_t channel,
                                     const adc_oneshot_chan_cfg_t *config);
esp_err_t adc_oneshot_read(adc_oneshot_unit_handle_t handle, adc_channel_t channel, int *out_raw);

#endif  // OPENHOME_HOSTCHECK_ADC_ONESHOT_H
