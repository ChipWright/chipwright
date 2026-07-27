#include "chipwright/sdk.h"

#include <stdarg.h>
#include <stdio.h>

static const char *level_name(cw_log_level_t level) {
  switch (level) {
    case CW_LOG_DEBUG:
      return "debug";
    case CW_LOG_INFO:
      return "info";
    case CW_LOG_WARN:
      return "warn";
    case CW_LOG_ERROR:
      return "error";
  }
  return "info";
}

void cw_log(cw_log_level_t level, const char *fmt, ...) {
  va_list args;
  va_start(args, fmt);
  fprintf(stdout, "[%s] ", level_name(level));
  vfprintf(stdout, fmt, args);
  fputc('\n', stdout);
  va_end(args);
}

static cw_telemetry_sink_fn g_telemetry_sink = NULL;
static void *g_telemetry_sink_ctx = NULL;

void cw_telemetry_set_sink(cw_telemetry_sink_fn sink, void *ctx) {
  g_telemetry_sink = sink;
  g_telemetry_sink_ctx = ctx;
}

void cw_telemetry_emit(const char *metric, float value, const char *unit) {
  const char *safe_unit = unit != NULL ? unit : "";
  if (g_telemetry_sink != NULL) {
    const cw_telemetry_sample_t sample = {.metric = metric, .value = value, .unit = safe_unit};
    g_telemetry_sink(&sample, g_telemetry_sink_ctx);
    return;
  }
  fprintf(stdout, "telemetry metric=%s value=%.2f unit=%s\n", metric, (double)value, safe_unit);
}
