#include "openhome/sim.h"

static void capture_sink(const oh_telemetry_sample_t *sample, void *ctx) {
  oh_twin_capture_t *capture = ctx;
  if (capture->count >= OH_TWIN_MAX_SAMPLES) {
    capture->overflow = true;
    return;
  }
  capture->samples[capture->count] = *sample;
  capture->count++;
}

void oh_twin_capture_reset(oh_twin_capture_t *capture) {
  capture->count = 0;
  capture->overflow = false;
}

oh_status_t oh_twin_run(const oh_device_t *device, unsigned ticks, oh_twin_capture_t *capture) {
  oh_telemetry_set_sink(capture_sink, capture);
  const oh_status_t status = oh_device_run(device, ticks);
  oh_telemetry_set_sink(NULL, NULL);
  return status;
}
