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

void oh_telemetry_emit(const char *metric, float value, const char *unit) {
  fprintf(stdout, "telemetry metric=%s value=%.2f unit=%s\n", metric, (double)value,
          unit != NULL ? unit : "");
}
