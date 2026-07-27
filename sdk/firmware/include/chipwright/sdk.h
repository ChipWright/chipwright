#ifndef CHIPWRIGHT_SDK_H
#define CHIPWRIGHT_SDK_H

#include <stddef.h>

// Core SDK surface: status codes, logging, telemetry, and the device lifecycle. This
// is the header that generated firmware interfaces include; it is portable across
// targets, with per-target behavior supplied by a board support package (BSP).

typedef enum {
  CW_OK = 0,
  CW_ERR_INVALID = 1,
  CW_ERR_NOT_FOUND = 2,
  CW_ERR_CAPACITY = 3,
  CW_ERR_IO = 4,
} cw_status_t;

typedef enum {
  CW_LOG_DEBUG,
  CW_LOG_INFO,
  CW_LOG_WARN,
  CW_LOG_ERROR,
} cw_log_level_t;

void cw_log(cw_log_level_t level, const char *fmt, ...);

typedef struct {
  const char *metric;
  float value;
  const char *unit;
} cw_telemetry_sample_t;

typedef void (*cw_telemetry_sink_fn)(const cw_telemetry_sample_t *sample, void *ctx);

// Redirects telemetry samples to a custom sink. The simulator uses this to capture
// samples, and the cloud BSP will use it to forward them. Passing NULL restores the
// default sink, which writes to stdout.
void cw_telemetry_set_sink(cw_telemetry_sink_fn sink, void *ctx);

// Emits one telemetry sample. The transport is provided by the SDK; by default it is
// written to stdout, unless a sink has been installed with cw_telemetry_set_sink.
void cw_telemetry_emit(const char *metric, float value, const char *unit);

typedef struct {
  const char *name;
} cw_device_t;

cw_status_t cw_device_init(const cw_device_t *device);

// Runs `ticks` sampling cycles. Each cycle reads every sensor registered with the HAL
// and emits a telemetry sample for it.
cw_status_t cw_device_run(const cw_device_t *device, unsigned ticks);

// Applies one inbound command line of the form "command key=<key> mode=<int>". A recognized
// command drives the actuator through the HAL and, on success, emits an acknowledgment line
// "actuator key=<key> mode=<int>" so a host (or the HIL test backend) can confirm the applied
// state. Returns CW_OK when a command was parsed and applied, CW_ERR_INVALID for a malformed
// line, or the HAL status when the actuator is unknown or rejects the mode.
cw_status_t cw_command_apply(const char *line);

#endif  // CHIPWRIGHT_SDK_H
