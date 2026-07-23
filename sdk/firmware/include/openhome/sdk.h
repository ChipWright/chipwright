#ifndef OPENHOME_SDK_H
#define OPENHOME_SDK_H

#include <stddef.h>

// Core SDK surface: status codes, logging, telemetry, and the device lifecycle. This
// is the header that generated firmware interfaces include; it is portable across
// targets, with per-target behavior supplied by a board support package (BSP).

typedef enum {
  OH_OK = 0,
  OH_ERR_INVALID = 1,
  OH_ERR_NOT_FOUND = 2,
  OH_ERR_CAPACITY = 3,
  OH_ERR_IO = 4,
} oh_status_t;

typedef enum {
  OH_LOG_DEBUG,
  OH_LOG_INFO,
  OH_LOG_WARN,
  OH_LOG_ERROR,
} oh_log_level_t;

void oh_log(oh_log_level_t level, const char *fmt, ...);

typedef struct {
  const char *metric;
  float value;
  const char *unit;
} oh_telemetry_sample_t;

typedef void (*oh_telemetry_sink_fn)(const oh_telemetry_sample_t *sample, void *ctx);

// Redirects telemetry samples to a custom sink. The simulator uses this to capture
// samples, and the cloud BSP will use it to forward them. Passing NULL restores the
// default sink, which writes to stdout.
void oh_telemetry_set_sink(oh_telemetry_sink_fn sink, void *ctx);

// Emits one telemetry sample. The transport is provided by the SDK; by default it is
// written to stdout, unless a sink has been installed with oh_telemetry_set_sink.
void oh_telemetry_emit(const char *metric, float value, const char *unit);

typedef struct {
  const char *name;
} oh_device_t;

oh_status_t oh_device_init(const oh_device_t *device);

// Runs `ticks` sampling cycles. Each cycle reads every sensor registered with the HAL
// and emits a telemetry sample for it.
oh_status_t oh_device_run(const oh_device_t *device, unsigned ticks);

#endif  // OPENHOME_SDK_H
