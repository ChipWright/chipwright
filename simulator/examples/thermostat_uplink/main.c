// Runs the thermostat twin and emits each telemetry sample as a line of NDJSON on stdout.
// A bridge process reads these lines and POSTs them to the cloud, so this is the device
// end of a full device-to-cloud telemetry path without adding a network stack to the C
// firmware.

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "chipwright/sim.h"

#include <stdio.h>

static void ndjson_sink(const cw_telemetry_sample_t *sample, void *ctx) {
  (void)ctx;
  printf("{\"metric\":\"%s\",\"value\":%.2f,\"unit\":\"%s\"}\n", sample->metric,
         (double)sample->value, sample->unit);
  fflush(stdout);
}

int main(void) {
  cw_sim_source_t source;
  cw_fault_sensor_t sensor;
  cw_sim_source_init(&source, 21.0f, 0.5f);
  cw_fault_sensor_init(&sensor, cw_sim_source_driver(&source));

  cw_hal_reset();
  cw_hal_register_sensor("temperature_sensor", "celsius", cw_fault_sensor_driver(&sensor));

  const cw_device_t device = {.name = "smart_thermostat"};
  cw_device_init(&device);

  cw_telemetry_set_sink(ndjson_sink, NULL);
  cw_device_run(&device, 5);
  cw_telemetry_set_sink(NULL, NULL);
  return 0;
}
