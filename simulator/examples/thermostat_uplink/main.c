// Runs the thermostat twin and emits each telemetry sample as a line of NDJSON on stdout.
// A bridge process reads these lines and POSTs them to the cloud, so this is the device
// end of a full device-to-cloud telemetry path without adding a network stack to the C
// firmware.

#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "openhome/sim.h"

#include <stdio.h>

static void ndjson_sink(const oh_telemetry_sample_t *sample, void *ctx) {
  (void)ctx;
  printf("{\"metric\":\"%s\",\"value\":%.2f,\"unit\":\"%s\"}\n", sample->metric,
         (double)sample->value, sample->unit);
  fflush(stdout);
}

int main(void) {
  oh_sim_source_t source;
  oh_fault_sensor_t sensor;
  oh_sim_source_init(&source, 21.0f, 0.5f);
  oh_fault_sensor_init(&sensor, oh_sim_source_driver(&source));

  oh_hal_reset();
  oh_hal_register_sensor("temperature_sensor", "celsius", oh_fault_sensor_driver(&sensor));

  const oh_device_t device = {.name = "smart_thermostat"};
  oh_device_init(&device);

  oh_telemetry_set_sink(ndjson_sink, NULL);
  oh_device_run(&device, 5);
  oh_telemetry_set_sink(NULL, NULL);
  return 0;
}
