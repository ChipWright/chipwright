#include "openhome/protocol.h"

#include <string.h>

// Number of message exchanges a commissioning session must complete: discovery, secure
// session establishment, and operational handoff. Simplified from the real Matter flow
// but enough to model retry behavior under packet loss.
#define OH_MATTER_COMMISSION_STEPS 3

oh_matter_cluster_t oh_matter_map_capability(oh_capability_desc_t capability) {
  if (capability.kind == OH_CAP_SENSOR) {
    if (capability.key != NULL && strcmp(capability.key, "temperature_sensor") == 0) {
      const oh_matter_cluster_t cluster = {.cluster = "TemperatureMeasurement",
                                           .primary = "MeasuredValue"};
      return cluster;
    }
    const oh_matter_cluster_t generic = {.cluster = "GenericSensor", .primary = "MeasuredValue"};
    return generic;
  }

  if (capability.key != NULL && strcmp(capability.key, "hvac") == 0) {
    const oh_matter_cluster_t cluster = {.cluster = "Thermostat", .primary = "SystemMode"};
    return cluster;
  }
  const oh_matter_cluster_t generic = {.cluster = "OnOff", .primary = "Toggle"};
  return generic;
}

void oh_matter_session_init(oh_matter_session_t *session, const char *device_name) {
  session->device_name = device_name;
  session->steps_total = OH_MATTER_COMMISSION_STEPS;
  session->steps_completed = 0;
  session->retries_used = 0;
}

oh_status_t oh_matter_commission(oh_matter_session_t *session, oh_sim_transport_t *transport,
                                 unsigned max_retries_per_step) {
  static const char kExchange[] = "matter-commission-exchange";

  for (unsigned step = 0; step < session->steps_total; step++) {
    bool delivered = false;
    for (unsigned attempt = 0; attempt <= max_retries_per_step; attempt++) {
      if (oh_sim_transport_send(transport, kExchange, (unsigned)sizeof(kExchange))) {
        delivered = true;
        break;
      }
      session->retries_used++;
    }
    if (!delivered) {
      return OH_ERR_IO;
    }
    session->steps_completed++;
  }
  return OH_OK;
}
