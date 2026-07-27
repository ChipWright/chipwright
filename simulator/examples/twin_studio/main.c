// A controllable twin for the developer IDE's live debugger. It runs the same SDK and HAL
// as physical firmware, emitting one NDJSON telemetry line per tick per sensor on stdout and
// pausing between ticks so the stream can be observed in real time. The device it runs is not
// hardwired: a descriptor (--descriptor) lists the manifest's sensors and actuators, so the twin
// reflects whatever device is open, with a simulated source behind each sensor. A sensor fault
// can be injected at a chosen tick on a chosen sensor, so the debugger shows the stream reacting
// to stuck, failing, or drifting readings. With no descriptor it falls back to a single
// temperature sensor, so existing callers keep working.

#define _POSIX_C_SOURCE 200809L

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "chipwright/sim.h"

#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

#define TWIN_MAX_CAPS 32
#define TWIN_KEY_LEN 64
#define TWIN_UNIT_LEN 32

typedef struct {
  char key[TWIN_KEY_LEN];
  char unit[TWIN_UNIT_LEN];
  float initial;
  float step;
} twin_sensor_t;

typedef struct {
  char device_name[TWIN_KEY_LEN];
  twin_sensor_t sensors[TWIN_MAX_CAPS];
  unsigned sensor_count;
  char actuators[TWIN_MAX_CAPS][TWIN_KEY_LEN];
  unsigned actuator_count;
} twin_spec_t;

typedef struct {
  unsigned ticks;
  unsigned interval_ms;
  float initial;
  float step;
  cw_fault_kind_t fault;
  long fault_at;
  float offset;
  char fault_target[TWIN_KEY_LEN];
  char descriptor[1024];
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
    } else if (strcmp(argv[i], "--fault-target") == 0) {
      snprintf(args->fault_target, sizeof args->fault_target, "%s", value);
    } else if (strcmp(argv[i], "--descriptor") == 0) {
      snprintf(args->descriptor, sizeof args->descriptor, "%s", value);
    } else {
      continue;
    }
    i++;
  }
}

// Seeds a sensor's simulated source from its declared range: it starts mid-range and drifts
// gently across it, so the stream looks plausible for the unit. A rangeless sensor uses the
// generic defaults so it still moves.
static void seed_sensor(twin_sensor_t *sensor, bool has_range, float min, float max,
                        float default_initial, float default_step) {
  if (has_range && max > min) {
    sensor->initial = (min + max) / 2.0f;
    sensor->step = (max - min) / 80.0f;
  } else {
    sensor->initial = default_initial;
    sensor->step = default_step;
  }
}

static void add_default_device(twin_spec_t *spec, const twin_args_t *args) {
  snprintf(spec->device_name, sizeof spec->device_name, "%s", "smart_thermostat");
  twin_sensor_t *sensor = &spec->sensors[0];
  snprintf(sensor->key, sizeof sensor->key, "%s", "temperature_sensor");
  snprintf(sensor->unit, sizeof sensor->unit, "%s", "celsius");
  seed_sensor(sensor, true, -20.0f, 50.0f, args->initial, args->step);
  spec->sensor_count = 1;
}

// Parses the device descriptor: one directive per line.
//   device <name>
//   sensor <key> <unit> [<min> <max>]
//   actuator <key> [<modes>]
// Returns false when the file cannot be read, so the caller can fall back to the default device.
static bool load_descriptor(const char *path, twin_spec_t *spec, const twin_args_t *args) {
  FILE *file = fopen(path, "r");
  if (file == NULL) {
    return false;
  }
  char line[512];
  while (fgets(line, sizeof line, file) != NULL) {
    char key[TWIN_KEY_LEN];
    char unit[TWIN_UNIT_LEN];
    float min = 0.0f;
    float max = 0.0f;
    if (sscanf(line, "device %63s", key) == 1) {
      snprintf(spec->device_name, sizeof spec->device_name, "%s", key);
    } else if (spec->sensor_count < TWIN_MAX_CAPS &&
               sscanf(line, "sensor %63s %31s %f %f", key, unit, &min, &max) >= 2) {
      const bool has_range = sscanf(line, "sensor %63s %31s %f %f", key, unit, &min, &max) == 4;
      twin_sensor_t *sensor = &spec->sensors[spec->sensor_count++];
      snprintf(sensor->key, sizeof sensor->key, "%s", key);
      snprintf(sensor->unit, sizeof sensor->unit, "%s", unit);
      seed_sensor(sensor, has_range, min, max, args->initial, args->step);
    } else if (spec->actuator_count < TWIN_MAX_CAPS && sscanf(line, "actuator %63s", key) == 1) {
      snprintf(spec->actuators[spec->actuator_count++], TWIN_KEY_LEN, "%s", key);
    }
  }
  fclose(file);
  if (spec->device_name[0] == '\0') {
    snprintf(spec->device_name, sizeof spec->device_name, "%s", "device");
  }
  return spec->sensor_count > 0 || spec->actuator_count > 0;
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
      .fault_target = {0},
      .descriptor = {0},
  };
  parse_args(argc, argv, &args);

  twin_spec_t spec = {0};
  if (args.descriptor[0] == '\0' || !load_descriptor(args.descriptor, &spec, &args)) {
    add_default_device(&spec, &args);
  }

  // These live for the whole run: the HAL stores drivers whose context points into them.
  cw_sim_source_t sources[TWIN_MAX_CAPS];
  cw_fault_sensor_t faults[TWIN_MAX_CAPS];
  cw_sim_actuator_t actuators[TWIN_MAX_CAPS];

  cw_hal_reset();
  for (unsigned i = 0; i < spec.sensor_count; i++) {
    cw_sim_source_init(&sources[i], spec.sensors[i].initial, spec.sensors[i].step);
    cw_fault_sensor_init(&faults[i], cw_sim_source_driver(&sources[i]));
    cw_hal_register_sensor(spec.sensors[i].key, spec.sensors[i].unit,
                           cw_fault_sensor_driver(&faults[i]));
  }
  for (unsigned i = 0; i < spec.actuator_count; i++) {
    cw_sim_actuator_init(&actuators[i], spec.actuators[i]);
    cw_hal_register_actuator(spec.actuators[i], cw_sim_actuator_driver(&actuators[i]));
  }

  // The fault targets the named sensor, or the first sensor when no target is given.
  unsigned fault_index = 0;
  if (args.fault_target[0] != '\0') {
    for (unsigned i = 0; i < spec.sensor_count; i++) {
      if (strcmp(spec.sensors[i].key, args.fault_target) == 0) {
        fault_index = i;
        break;
      }
    }
  }

  const cw_device_t device = {.name = spec.device_name};
  cw_device_init(&device);

  cw_telemetry_set_sink(ndjson_sink, NULL);
  for (unsigned tick = 0; tick < args.ticks; tick++) {
    if (args.fault != CW_FAULT_NONE && args.fault_at >= 0 && (long)tick == args.fault_at &&
        spec.sensor_count > 0) {
      const cw_fault_config_t config = {.kind = args.fault, .offset = args.offset};
      cw_fault_sensor_set(&faults[fault_index], config);
    }
    cw_device_run(&device, 1);
    if (tick + 1 < args.ticks) {
      sleep_ms(args.interval_ms);
    }
  }
  cw_telemetry_set_sink(NULL, NULL);
  return 0;
}
