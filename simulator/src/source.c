#include "chipwright/sim.h"

static cw_status_t source_read(void *ctx, float *out_value) {
  cw_sim_source_t *source = ctx;
  source->value += source->step;
  *out_value = source->value;
  return CW_OK;
}

void cw_sim_source_init(cw_sim_source_t *source, float initial, float step) {
  source->value = initial;
  source->step = step;
}

cw_sensor_driver_t cw_sim_source_driver(cw_sim_source_t *source) {
  const cw_sensor_driver_t driver = {.read = source_read, .ctx = source};
  return driver;
}

void cw_sim_signal_init(cw_sim_signal_t *signal, float min, float max) {
  if (max < min) {
    const float swap = min;
    min = max;
    max = swap;
  }
  signal->min = min;
  signal->max = max;
  signal->value = (min + max) * 0.5f;
  signal->target = signal->value;
  const unsigned seed = (unsigned)((min + max) * 131.0f) + 0x9e3779b9u;
  signal->rng = seed == 0u ? 1u : seed;
}

void cw_sim_signal_set_target(cw_sim_signal_t *signal, float target) {
  if (target < signal->min) {
    target = signal->min;
  }
  if (target > signal->max) {
    target = signal->max;
  }
  signal->target = target;
}

// xorshift32 noise in the range [-0.5, 0.5], so the signal jitters rather than tracking its
// target on a perfectly smooth line.
static float signal_noise(cw_sim_signal_t *signal) {
  signal->rng ^= signal->rng << 13;
  signal->rng ^= signal->rng >> 17;
  signal->rng ^= signal->rng << 5;
  return ((float)(signal->rng & 0xffffu) / 65535.0f) - 0.5f;
}

static cw_status_t signal_read(void *ctx, float *out_value) {
  cw_sim_signal_t *signal = ctx;
  const float span = signal->max - signal->min;
  signal->value += (signal->target - signal->value) * 0.12f + signal_noise(signal) * span * 0.04f;
  if (signal->value < signal->min) {
    signal->value = signal->min;
  }
  if (signal->value > signal->max) {
    signal->value = signal->max;
  }
  *out_value = signal->value;
  return CW_OK;
}

cw_sensor_driver_t cw_sim_signal_driver(cw_sim_signal_t *signal) {
  const cw_sensor_driver_t driver = {.read = signal_read, .ctx = signal};
  return driver;
}

static cw_status_t actuator_set_mode(void *ctx, int mode) {
  cw_sim_actuator_t *actuator = ctx;
  actuator->mode = mode;
  cw_log(CW_LOG_INFO, "actuator %s mode %d", actuator->key, mode);
  return CW_OK;
}

void cw_sim_actuator_init(cw_sim_actuator_t *actuator, const char *key) {
  actuator->key = key;
  actuator->mode = 0;
}

cw_actuator_driver_t cw_sim_actuator_driver(cw_sim_actuator_t *actuator) {
  const cw_actuator_driver_t driver = {.set_mode = actuator_set_mode, .ctx = actuator};
  return driver;
}
