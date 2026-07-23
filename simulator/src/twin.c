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

void oh_twin_network_init(oh_twin_network_t *network, unsigned loss_percent, unsigned seed) {
  oh_sim_transport_init(&network->transport, loss_percent, seed);
  network->telemetry_uplinked = 0;
  network->telemetry_dropped = 0;
}

oh_status_t oh_twin_commission(oh_twin_network_t *network, const char *device_name,
                               unsigned max_retries_per_step, oh_matter_session_t *out_session) {
  oh_matter_session_init(out_session, device_name);
  return oh_matter_commission(out_session, &network->transport, max_retries_per_step);
}

typedef struct {
  oh_twin_capture_t *capture;
  oh_twin_network_t *network;
} networked_sink_ctx_t;

static void networked_sink(const oh_telemetry_sample_t *sample, void *ctx) {
  networked_sink_ctx_t *state = ctx;
  if (state->capture->count < OH_TWIN_MAX_SAMPLES) {
    state->capture->samples[state->capture->count] = *sample;
    state->capture->count++;
  } else {
    state->capture->overflow = true;
  }
  if (oh_sim_transport_send(&state->network->transport, sample, (unsigned)sizeof(*sample))) {
    state->network->telemetry_uplinked++;
  } else {
    state->network->telemetry_dropped++;
  }
}

oh_status_t oh_twin_run_networked(const oh_device_t *device, unsigned ticks,
                                  oh_twin_capture_t *capture, oh_twin_network_t *network) {
  networked_sink_ctx_t state = {.capture = capture, .network = network};
  oh_telemetry_set_sink(networked_sink, &state);
  const oh_status_t status = oh_device_run(device, ticks);
  oh_telemetry_set_sink(NULL, NULL);
  return status;
}
