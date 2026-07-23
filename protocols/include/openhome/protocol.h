#ifndef OPENHOME_PROTOCOL_H
#define OPENHOME_PROTOCOL_H

#include <stdbool.h>

#include "openhome/sdk.h"

// Protocol layer. For the MVP this models Matter commissioning over a simulated
// transport, so the commissioning and cluster-mapping logic can be developed and tested
// without radios or the upstream connectedhomeip stack. A real build will back the same
// interfaces with connectedhomeip; see the protocols README.

// Simulated network transport with configurable, deterministic packet loss. Determinism
// (a seeded PRNG) keeps commissioning tests reproducible. This is also the network fault
// mechanism the digital twin will use for packet-loss scenarios.
typedef struct {
  unsigned loss_percent;
  unsigned rng_state;
  unsigned sent;
  unsigned dropped;
} oh_sim_transport_t;

void oh_sim_transport_init(oh_sim_transport_t *transport, unsigned loss_percent, unsigned seed);

// Attempts to deliver one message. Returns true when delivered, false when dropped.
bool oh_sim_transport_send(oh_sim_transport_t *transport, const void *payload, unsigned length);

// Capability descriptor used to map a device onto protocol constructs. It mirrors the
// DDL capability model; a future device-engine generator will emit these tables from the
// manifest so the mapping is not maintained by hand.
typedef enum {
  OH_CAP_SENSOR = 0,
  OH_CAP_ACTUATOR = 1,
} oh_capability_kind_t;

typedef struct {
  const char *key;
  oh_capability_kind_t kind;
} oh_capability_desc_t;

// The Matter cluster a capability maps onto, with its primary attribute (for sensors) or
// command (for actuators).
typedef struct {
  const char *cluster;
  const char *primary;
} oh_matter_cluster_t;

oh_matter_cluster_t oh_matter_map_capability(oh_capability_desc_t capability);

// A simulated Matter commissioning session. Commissioning completes a fixed sequence of
// message exchanges, retrying each over a lossy transport up to a per-step retry budget.
typedef struct {
  const char *device_name;
  unsigned steps_total;
  unsigned steps_completed;
  unsigned retries_used;
} oh_matter_session_t;

void oh_matter_session_init(oh_matter_session_t *session, const char *device_name);

// Runs commissioning. Returns OH_OK when every step is delivered within its retry budget,
// or OH_ERR_IO when a step exhausts its retries (the transport is too lossy).
oh_status_t oh_matter_commission(oh_matter_session_t *session, oh_sim_transport_t *transport,
                                 unsigned max_retries_per_step);

#endif  // OPENHOME_PROTOCOL_H
