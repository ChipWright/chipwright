// Runs the smart_thermostat as a digital twin: the same SDK and HAL as firmware, driven
// by a simulated temperature source, while faults are injected mid-run to show how the
// device behaves under sensor drift, a stuck sensor, and an outright sensor failure.

#include "chipwright/hal.h"
#include "chipwright/sdk.h"
#include "chipwright/sim.h"

#include <stdio.h>

static void report(const char *scenario, const cw_twin_capture_t *capture) {
  printf("scenario: %s (%u sample(s))\n", scenario, capture->count);
  for (unsigned i = 0; i < capture->count; i++) {
    const cw_telemetry_sample_t *s = &capture->samples[i];
    printf("  %s = %.2f %s\n", s->metric, (double)s->value, s->unit);
  }
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

  cw_twin_capture_t capture;

  cw_twin_capture_reset(&capture);
  cw_twin_run(&device, 3, &capture);
  report("nominal", &capture);

  const cw_fault_config_t offset = {.kind = CW_FAULT_OFFSET, .offset = 5.0f};
  cw_fault_sensor_set(&sensor, offset);
  cw_twin_capture_reset(&capture);
  cw_twin_run(&device, 3, &capture);
  report("calibration drift (+5.0)", &capture);

  const cw_fault_config_t stuck = {.kind = CW_FAULT_STUCK, .offset = 0.0f};
  cw_fault_sensor_set(&sensor, stuck);
  cw_twin_capture_reset(&capture);
  cw_twin_run(&device, 3, &capture);
  report("stuck sensor", &capture);

  const cw_fault_config_t fail = {.kind = CW_FAULT_FAIL, .offset = 0.0f};
  cw_fault_sensor_set(&sensor, fail);
  cw_twin_capture_reset(&capture);
  cw_twin_run(&device, 3, &capture);
  report("sensor failure", &capture);

  // Network fault injection: commission and stream telemetry over a lossy link.
  const cw_fault_config_t nominal = {.kind = CW_FAULT_NONE, .offset = 0.0f};
  cw_fault_sensor_set(&sensor, nominal);
  cw_sim_source_init(&source, 21.0f, 0.5f);

  cw_twin_network_t network;
  cw_twin_network_init(&network, 40, 2026);
  cw_matter_session_t session;
  const cw_status_t commissioned = cw_twin_commission(&network, device.name, 10, &session);
  printf("network: commissioning over 40%% loss link: %s (retries %u)\n",
         commissioned == CW_OK ? "survived" : "failed", session.retries_used);

  cw_twin_capture_reset(&capture);
  cw_twin_run_networked(&device, 5, &capture, &network);
  printf("network: telemetry over lossy link: %u captured, %u uplinked, %u dropped\n",
         capture.count, network.telemetry_uplinked, network.telemetry_dropped);

  return 0;
}
