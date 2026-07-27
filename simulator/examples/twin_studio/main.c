// A controllable twin for the developer IDE's live debugger. It runs the same SDK and HAL
// as physical firmware, emitting one NDJSON telemetry line per tick on stdout and pausing
// between ticks so the stream can be observed in real time. A sensor fault can be injected
// at a chosen tick, so the debugger shows the stream reacting to stuck, failing, or drifting
// readings. The telemetry shape matches the cloud bridge, so the same output can be piped
// to either the IDE or the bridge.

#define _POSIX_C_SOURCE 200809L

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "chipwright/sim.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef struct {
  unsigned ticks;
  unsigned interval_ms;
  float initial;
  float step;
  cw_fault_kind_t fault;
  long fault_at;
  float offset;
} twin_args_t;

static void ndjson_sink(const cw_telemetry_sample_t *sample, void *ctx) {
  (void)ctx;
  printf("{\"metric\":\"%s\",\"value\":%.2f,\"unit\":\"%s\"}\n", sample->metric,
         (double)sample->value, sample->unit);
  fflush(stdout);
}

static cw_fault_kind_t parse_fault(const char *name) {
  if (strcmp(name, "stuck") == 0) {
    return CW_FAULT_STUCK;
  }
  if (strcmp(name, "fail") == 0) {
    return CW_FAULT_FAIL;
  }
  if (strcmp(name, "offset") == 0) {
    return CW_FAULT_OFFSET;
  }
  return CW_FAULT_NONE;
}

static const char *option_value(int argc, char **argv, int index) {
  return index + 1 < argc ? argv[index + 1] : NULL;
}

static void parse_args(int argc, char **argv, twin_args_t *args) {
  for (int i = 1; i < argc; i++) {
    const char *value = option_value(argc, argv, i);
    if (value == NULL) {
      break;
    }
    if (strcmp(argv[i], "--ticks") == 0) {
      args->ticks = (unsigned)strtoul(value, NULL, 10);
    } else if (strcmp(argv[i], "--interval-ms") == 0) {
      args->interval_ms = (unsigned)strtoul(value, NULL, 10);
    } else if (strcmp(argv[i], "--initial") == 0) {
      args->initial = strtof(value, NULL);
    } else if (strcmp(argv[i], "--step") == 0) {
      args->step = strtof(value, NULL);
    } else if (strcmp(argv[i], "--fault") == 0) {
      args->fault = parse_fault(value);
    } else if (strcmp(argv[i], "--fault-at") == 0) {
      args->fault_at = strtol(value, NULL, 10);
    } else if (strcmp(argv[i], "--offset") == 0) {
      args->offset = strtof(value, NULL);
    } else {
      continue;
    }
    i++;
  }
}

static void sleep_ms(unsigned ms) {
  struct timespec req = {.tv_sec = ms / 1000, .tv_nsec = (long)(ms % 1000) * 1000000L};
  nanosleep(&req, NULL);
}

int main(int argc, char **argv) {
  twin_args_t args = {
      .ticks = 20,
      .interval_ms = 200,
      .initial = 21.0f,
      .step = 0.5f,
      .fault = CW_FAULT_NONE,
      .fault_at = -1,
      .offset = 5.0f,
  };
  parse_args(argc, argv, &args);

  cw_sim_source_t source;
  cw_fault_sensor_t sensor;
  cw_sim_source_init(&source, args.initial, args.step);
  cw_fault_sensor_init(&sensor, cw_sim_source_driver(&source));

  cw_hal_reset();
  cw_hal_register_sensor("temperature_sensor", "celsius", cw_fault_sensor_driver(&sensor));

  const cw_device_t device = {.name = "smart_thermostat"};
  cw_device_init(&device);

  cw_telemetry_set_sink(ndjson_sink, NULL);
  for (unsigned tick = 0; tick < args.ticks; tick++) {
    if (args.fault != CW_FAULT_NONE && args.fault_at >= 0 && (long)tick == args.fault_at) {
      const cw_fault_config_t config = {.kind = args.fault, .offset = args.offset};
      cw_fault_sensor_set(&sensor, config);
    }
    cw_device_run(&device, 1);
    if (tick + 1 < args.ticks) {
      sleep_ms(args.interval_ms);
    }
  }
  cw_telemetry_set_sink(NULL, NULL);
  return 0;
}
