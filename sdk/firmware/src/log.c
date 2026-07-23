#include "openhome/sdk.h"

#include <stdarg.h>
#include <stdio.h>

static const char *level_name(oh_log_level_t level) {
  switch (level) {
    case OH_LOG_DEBUG:
      return "debug";
    case OH_LOG_INFO:
      return "info";
    case OH_LOG_WARN:
      return "warn";
    case OH_LOG_ERROR:
      return "error";
  }
  return "info";
}

void oh_log(oh_log_level_t level, const char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  fprintf(stdout, "[%s] ", level_name(level));
  vfprintf(stdout, fmt, args);
  fputc('\n', stdout);
  va_end(args);
}

static oh_telemetry_sink_fn g_telemetry_sink = NULL;
static void *g_telemetry_sink_ctx = NULL;

void oh_telemetry_set_sink(oh_telemetry_sink_fn sink, void *ctx) {
  g_telemetry_sink = sink;
  g_telemetry_sink_ctx = ctx;
}

void oh_telemetry_emit(const char *metric, float value, const char *unit) {
  const char *safe_unit = unit != NULL ? unit : "";
  if (g_telemetry_sink != NULL) {
    const oh_telemetry_sample_t sample = {.metric = metric, .value = value, .unit = safe_unit};
    g_telemetry_sink(&sample, g_telemetry_sink_ctx);
    return;
  }
  fprintf(stdout, "telemetry metric=%s value=%.2f unit=%s\n", metric, (double)value, safe_unit);
}
