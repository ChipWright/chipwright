// A controllable twin for the developer IDE's live debugger. It runs the same SDK and HAL as
// physical firmware, emitting one NDJSON telemetry line per tick per sensor on stdout. The device
// it runs is described at runtime (--descriptor): each sensor gets a bounded simulated signal that
// stays within its declared range, and each actuator can drive the reading up or down (heating
// raises a temperature, cooling lowers it) via commands read on stdin, so the twin reflects the
// open device and reacts to it. A sensor fault can be injected at a chosen tick on a chosen sensor.
// It streams until stopped (--ticks 0), or for a fixed number of ticks. With no descriptor it falls
// back to a single temperature sensor, so existing callers keep working.

#ifndef _WIN32
#define _POSIX_C_SOURCE 200809L
#endif

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "chipwright/sim.h"

#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifdef _WIN32
#include <windows.h>
#else
#include <fcntl.h>
#include <time.h>
#include <unistd.h>
#endif

#define TWIN_MAX_CAPS 32
#define TWIN_MAX_MODES 12
#define TWIN_KEY_LEN 64
#define TWIN_UNIT_LEN 32
#define TWIN_MODE_LEN 24

typedef struct {
  char key[TWIN_KEY_LEN];
  char unit[TWIN_UNIT_LEN];
  float min;
  float max;
} twin_sensor_t;

typedef struct {
  char key[TWIN_KEY_LEN];
  char modes[TWIN_MAX_MODES][TWIN_MODE_LEN];
  unsigned mode_count;
  int direction; // current influence on the environment: +1 up, -1 down, 0 neutral
} twin_actuator_t;

typedef struct {
  char device_name[TWIN_KEY_LEN];
  twin_sensor_t sensors[TWIN_MAX_CAPS];
  unsigned sensor_count;
  twin_actuator_t actuators[TWIN_MAX_CAPS];
  unsigned actuator_count;
} twin_spec_t;

typedef struct {
  unsigned ticks; // 0 means stream until stopped
  unsigned interval_ms;
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

static void add_default_device(twin_spec_t *spec) {
  snprintf(spec->device_name, sizeof spec->device_name, "%s", "smart_thermostat");
  twin_sensor_t *sensor = &spec->sensors[0];
  snprintf(sensor->key, sizeof sensor->key, "%s", "temperature_sensor");
  snprintf(sensor->unit, sizeof sensor->unit, "%s", "celsius");
  sensor->min = -20.0f;
  sensor->max = 50.0f;
  spec->sensor_count = 1;
}

// Parses the device descriptor: one directive per line.
//   device <name>
//   sensor <key> <unit> [<min> <max>]
//   actuator <key> [<mode> ...]
// A rangeless sensor gets a default 0..100 range so its bounded signal has bounds. Returns false
// when the file cannot be read, so the caller can fall back to the default device.
static bool load_descriptor(const char *path, twin_spec_t *spec) {
  FILE *file = fopen(path, "r");
  if (file == NULL) {
    return false;
  }
  char line[512];
  while (fgets(line, sizeof line, file) != NULL) {
    char key[TWIN_KEY_LEN];
    char unit[TWIN_UNIT_LEN];
    float min = 0.0f;
    float max = 100.0f;
    if (sscanf(line, "device %63s", key) == 1) {
      snprintf(spec->device_name, sizeof spec->device_name, "%s", key);
    } else if (strncmp(line, "sensor ", 7) == 0 && spec->sensor_count < TWIN_MAX_CAPS) {
      const int matched = sscanf(line, "sensor %63s %31s %f %f", key, unit, &min, &max);
      if (matched < 2) {
        continue;
      }
      twin_sensor_t *sensor = &spec->sensors[spec->sensor_count++];
      snprintf(sensor->key, sizeof sensor->key, "%s", key);
      snprintf(sensor->unit, sizeof sensor->unit, "%s", unit);
      sensor->min = matched == 4 ? min : 0.0f;
      sensor->max = matched == 4 ? max : 100.0f;
    } else if (strncmp(line, "actuator ", 9) == 0 && spec->actuator_count < TWIN_MAX_CAPS) {
      char *token = strtok(line + 9, " \t\r\n");
      if (token == NULL) {
        continue;
      }
      twin_actuator_t *actuator = &spec->actuators[spec->actuator_count++];
      snprintf(actuator->key, sizeof actuator->key, "%s", token);
      actuator->mode_count = 0;
      actuator->direction = 0;
      for (token = strtok(NULL, " \t\r\n"); token != NULL && actuator->mode_count < TWIN_MAX_MODES;
           token = strtok(NULL, " \t\r\n")) {
        snprintf(actuator->modes[actuator->mode_count++], TWIN_MODE_LEN, "%s", token);
      }
    }
  }
  fclose(file);
  if (spec->device_name[0] == '\0') {
    snprintf(spec->device_name, sizeof spec->device_name, "%s", "device");
  }
  return spec->sensor_count > 0 || spec->actuator_count > 0;
}

// Infers which way an actuator mode pushes the quantity it controls, from the mode name, since the
// definition does not declare the coupling. Heating/high/open push up, cooling/low/close push down,
// off/idle stay neutral.
static int mode_direction(const char *name) {
  char lower[TWIN_MODE_LEN];
  size_t i = 0;
  for (; name[i] != '\0' && i + 1 < sizeof lower; i++) {
    lower[i] = (char)tolower((unsigned char)name[i]);
  }
  lower[i] = '\0';
  if (strstr(lower, "heat") || strstr(lower, "warm") || strstr(lower, "high") ||
      strstr(lower, "open") || strstr(lower, "boost") || strstr(lower, "up") || strcmp(lower, "on") == 0) {
    return 1;
  }
  if (strstr(lower, "cool") || strstr(lower, "cold") || strstr(lower, "low") ||
      strstr(lower, "close") || strstr(lower, "down")) {
    return -1;
  }
  return 0;
}

// Re-aims every sensor from the combined actuator influence: neutral rests at the range midpoint,
// a positive influence drives toward the top of the range, a negative one toward the bottom.
static void apply_environment(const twin_spec_t *spec, cw_sim_signal_t *signals) {
  int bias = 0;
  for (unsigned i = 0; i < spec->actuator_count; i++) {
    bias += spec->actuators[i].direction;
  }
  if (bias > 1) {
    bias = 1;
  }
  if (bias < -1) {
    bias = -1;
  }
  for (unsigned i = 0; i < spec->sensor_count; i++) {
    const float center = (spec->sensors[i].min + spec->sensors[i].max) * 0.5f;
    const float half = (spec->sensors[i].max - spec->sensors[i].min) * 0.5f;
    cw_sim_signal_set_target(&signals[i], center + (float)bias * half * 0.9f);
  }
}

// Applies one command line "command key=<key> mode=<int>": sets the named actuator's influence
// from its mode and re-aims the environment. Unknown keys or modes are ignored.
static void apply_command(const char *line, twin_spec_t *spec, cw_sim_signal_t *signals) {
  char key[TWIN_KEY_LEN];
  int mode = 0;
  if (sscanf(line, "command key=%63s mode=%d", key, &mode) != 2) {
    return;
  }
  for (unsigned i = 0; i < spec->actuator_count; i++) {
    if (strcmp(spec->actuators[i].key, key) == 0) {
      if (mode >= 0 && (unsigned)mode < spec->actuators[i].mode_count) {
        spec->actuators[i].direction = mode_direction(spec->actuators[i].modes[mode]);
        apply_environment(spec, signals);
      }
      return;
    }
  }
}

#ifndef _WIN32
static void set_stdin_nonblocking(void) {
  const int flags = fcntl(STDIN_FILENO, F_GETFL, 0);
  if (flags != -1) {
    fcntl(STDIN_FILENO, F_SETFL, flags | O_NONBLOCK);
  }
}

// Drains any command bytes waiting on stdin and applies each complete line. Non-blocking, so the
// telemetry cadence is never stalled waiting for input; one partial line is buffered across calls.
static void poll_commands(twin_spec_t *spec, cw_sim_signal_t *signals) {
  static char line[256];
  static size_t len = 0;
  char byte = 0;
  while (read(STDIN_FILENO, &byte, 1) == 1) {
    if (byte == '\n' || byte == '\r') {
      if (len > 0) {
        line[len] = '\0';
        apply_command(line, spec, signals);
        len = 0;
      }
    } else if (len + 1 < sizeof line) {
      line[len++] = byte;
    } else {
      len = 0;
    }
  }
}

static void sleep_ms(unsigned ms) {
  struct timespec req = {.tv_sec = ms / 1000, .tv_nsec = (long)(ms % 1000) * 1000000L};
  nanosleep(&req, NULL);
}
#else
static void set_stdin_nonblocking(void) {}
static void poll_commands(twin_spec_t *spec, cw_sim_signal_t *signals) {
  (void)spec;
  (void)signals;
}
static void sleep_ms(unsigned ms) { Sleep(ms); }
#endif

int main(int argc, char **argv) {
  twin_args_t args = {
      .ticks = 20,
      .interval_ms = 200,
      .fault = CW_FAULT_NONE,
      .fault_at = -1,
      .offset = 5.0f,
      .fault_target = {0},
      .descriptor = {0},
  };
  parse_args(argc, argv, &args);

  twin_spec_t spec = {0};
  if (args.descriptor[0] == '\0' || !load_descriptor(args.descriptor, &spec)) {
    add_default_device(&spec);
  }

  // These live for the whole run: the HAL stores drivers whose context points into them.
  cw_sim_signal_t signals[TWIN_MAX_CAPS];
  cw_fault_sensor_t faults[TWIN_MAX_CAPS];
  cw_sim_actuator_t actuators[TWIN_MAX_CAPS];

  cw_hal_reset();
  for (unsigned i = 0; i < spec.sensor_count; i++) {
    cw_sim_signal_init(&signals[i], spec.sensors[i].min, spec.sensors[i].max);
    cw_fault_sensor_init(&faults[i], cw_sim_signal_driver(&signals[i]));
    cw_hal_register_sensor(spec.sensors[i].key, spec.sensors[i].unit,
                           cw_fault_sensor_driver(&faults[i]));
  }
  for (unsigned i = 0; i < spec.actuator_count; i++) {
    cw_sim_actuator_init(&actuators[i], spec.actuators[i].key);
    cw_hal_register_actuator(spec.actuators[i].key, cw_sim_actuator_driver(&actuators[i]));
  }

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
  set_stdin_nonblocking();

  cw_telemetry_set_sink(ndjson_sink, NULL);
  for (unsigned tick = 0; args.ticks == 0u || tick < args.ticks; tick++) {
    poll_commands(&spec, signals);
    if (args.fault != CW_FAULT_NONE && args.fault_at >= 0 && (long)tick == args.fault_at &&
        spec.sensor_count > 0) {
      const cw_fault_config_t config = {.kind = args.fault, .offset = args.offset};
      cw_fault_sensor_set(&faults[fault_index], config);
    }
    cw_device_run(&device, 1);
    sleep_ms(args.interval_ms);
  }
  cw_telemetry_set_sink(NULL, NULL);
  return 0;
}
