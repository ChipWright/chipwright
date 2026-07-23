// Runs the smart_thermostat as a digital twin: the same SDK and HAL as firmware, driven
// by a simulated temperature source, while faults are injected mid-run to show how the
// device behaves under sensor drift, a stuck sensor, and an outright sensor failure.

#include "openhome/hal.h"
#include "openhome/sdk.h"
#include "openhome/sim.h"

#include <stdio.h>

static void report(const char *scenario, const oh_twin_capture_t *capture) {
  printf("scenario: %s (%u sample(s))\n", scenario, capture->count);
  for (unsigned i = 0; i < capture->count; i++) {
    const oh_telemetry_sample_t *s = &capture->samples[i];
    printf("  %s = %.2f %s\n", s->metric, (double)s->value, s->unit);
  }
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

  oh_twin_capture_t capture;

  oh_twin_capture_reset(&capture);
  oh_twin_run(&device, 3, &capture);
  report("nominal", &capture);

  const oh_fault_config_t offset = {.kind = OH_FAULT_OFFSET, .offset = 5.0f};
  oh_fault_sensor_set(&sensor, offset);
  oh_twin_capture_reset(&capture);
  oh_twin_run(&device, 3, &capture);
  report("calibration drift (+5.0)", &capture);

  const oh_fault_config_t stuck = {.kind = OH_FAULT_STUCK, .offset = 0.0f};
  oh_fault_sensor_set(&sensor, stuck);
  oh_twin_capture_reset(&capture);
  oh_twin_run(&device, 3, &capture);
  report("stuck sensor", &capture);

  const oh_fault_config_t fail = {.kind = OH_FAULT_FAIL, .offset = 0.0f};
  oh_fault_sensor_set(&sensor, fail);
  oh_twin_capture_reset(&capture);
  oh_twin_run(&device, 3, &capture);
  report("sensor failure", &capture);

  // Network fault injection: commission and stream telemetry over a lossy link.
  const oh_fault_config_t nominal = {.kind = OH_FAULT_NONE, .offset = 0.0f};
  oh_fault_sensor_set(&sensor, nominal);
  oh_sim_source_init(&source, 21.0f, 0.5f);

  oh_twin_network_t network;
  oh_twin_network_init(&network, 40, 2026);
  oh_matter_session_t session;
  const oh_status_t commissioned = oh_twin_commission(&network, device.name, 10, &session);
  printf("network: commissioning over 40%% loss link: %s (retries %u)\n",
         commissioned == OH_OK ? "survived" : "failed", session.retries_used);

  oh_twin_capture_reset(&capture);
  oh_twin_run_networked(&device, 5, &capture, &network);
  printf("network: telemetry over lossy link: %u captured, %u uplinked, %u dropped\n",
         capture.count, network.telemetry_uplinked, network.telemetry_dropped);

  return 0;
}
