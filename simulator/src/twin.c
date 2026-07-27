#include "chipwright/sim.h"

static void capture_sink(const cw_telemetry_sample_t *sample, void *ctx) {
  cw_twin_capture_t *capture = ctx;
  if (capture->count >= CW_TWIN_MAX_SAMPLES) {
    capture->overflow = true;
    return;
  }
  capture->samples[capture->count] = *sample;
  capture->count++;
}

void cw_twin_capture_reset(cw_twin_capture_t *capture) {
  capture->count = 0;
  capture->overflow = false;
}

cw_status_t cw_twin_run(const cw_device_t *device, unsigned ticks, cw_twin_capture_t *capture) {
  cw_telemetry_set_sink(capture_sink, capture);
  const cw_status_t status = cw_device_run(device, ticks);
  cw_telemetry_set_sink(NULL, NULL);
  return status;
}

void cw_twin_network_init(cw_twin_network_t *network, unsigned loss_percent, unsigned seed) {
  cw_sim_transport_init(&network->transport, loss_percent, seed);
  network->telemetry_uplinked = 0;
  network->telemetry_dropped = 0;
}

cw_status_t cw_twin_commission(cw_twin_network_t *network, const char *device_name,
                               unsigned max_retries_per_step, cw_matter_session_t *out_session) {
  cw_matter_session_init(out_session, device_name);
  return cw_matter_commission(out_session, &network->transport, max_retries_per_step);
}

typedef struct {
  cw_twin_capture_t *capture;
  cw_twin_network_t *network;
} networked_sink_ctx_t;

static void networked_sink(const cw_telemetry_sample_t *sample, void *ctx) {
  networked_sink_ctx_t *state = ctx;
  if (state->capture->count < CW_TWIN_MAX_SAMPLES) {
    state->capture->samples[state->capture->count] = *sample;
    state->capture->count++;
  } else {
    state->capture->overflow = true;
  }
  if (cw_sim_transport_send(&state->network->transport, sample, (unsigned)sizeof(*sample))) {
    state->network->telemetry_uplinked++;
  } else {
    state->network->telemetry_dropped++;
  }
}

cw_status_t cw_twin_run_networked(const cw_device_t *device, unsigned ticks,
                                  cw_twin_capture_t *capture, cw_twin_network_t *network) {
  networked_sink_ctx_t state = {.capture = capture, .network = network};
  cw_telemetry_set_sink(networked_sink, &state);
  const cw_status_t status = cw_device_run(device, ticks);
  cw_telemetry_set_sink(NULL, NULL);
  return status;
}
