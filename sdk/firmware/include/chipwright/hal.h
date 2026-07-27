#ifndef CHIPWRIGHT_HAL_H
#define CHIPWRIGHT_HAL_H

#include "chipwright/sdk.h"

// Hardware Abstraction Layer. Device logic is written against capability traits -- a
// sensor that reads a scalar, an actuator that applies a mode -- and a BSP registers
// concrete drivers for a given board. Nothing above this layer knows the chip.

typedef struct {
  cw_status_t (*read)(void *ctx, float *out_value);
  void *ctx;
} cw_sensor_driver_t;

typedef struct {
  cw_status_t (*set_mode)(void *ctx, int mode);
  void *ctx;
} cw_actuator_driver_t;

cw_status_t cw_hal_register_sensor(const char *key, const char *unit, cw_sensor_driver_t driver);
cw_status_t cw_hal_register_actuator(const char *key, cw_actuator_driver_t driver);

cw_status_t cw_hal_read_sensor(const char *key, float *out_value);
cw_status_t cw_hal_set_actuator_mode(const char *key, int mode);

unsigned cw_hal_sensor_count(void);

// Reads the sensor at `index` and reports its key and unit. Used by the SDK telemetry
// loop to sample every registered sensor without knowing them at compile time.
cw_status_t cw_hal_sensor_at(unsigned index, const char **out_key, const char **out_unit, float *out_value);

// Clears all registered drivers. Primarily for tests and re-initialization.
void cw_hal_reset(void);

#endif  // CHIPWRIGHT_HAL_H
