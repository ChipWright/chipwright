#ifndef CHIPWRIGHT_PROTOCOL_H
#define CHIPWRIGHT_PROTOCOL_H

#include <stdbool.h>

#include "chipwright/sdk.h"

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
} cw_sim_transport_t;

void cw_sim_transport_init(cw_sim_transport_t *transport, unsigned loss_percent, unsigned seed);

// Attempts to deliver one message. Returns true when delivered, false when dropped.
bool cw_sim_transport_send(cw_sim_transport_t *transport, const void *payload, unsigned length);

// Capability descriptor used to map a device onto protocol constructs. It mirrors the
// DDL capability model; a future device-engine generator will emit these tables from the
// manifest so the mapping is not maintained by hand.
typedef enum {
  CW_CAP_SENSOR = 0,
  CW_CAP_ACTUATOR = 1,
} cw_capability_kind_t;

typedef struct {
  const char *key;
  cw_capability_kind_t kind;
} cw_capability_desc_t;

// The Matter cluster a capability maps onto, with its primary attribute (for sensors) or
// command (for actuators).
typedef struct {
  const char *cluster;
  const char *primary;
} cw_matter_cluster_t;

cw_matter_cluster_t cw_matter_map_capability(cw_capability_desc_t capability);

// A simulated Matter commissioning session. Commissioning completes a fixed sequence of
// message exchanges, retrying each over a lossy transport up to a per-step retry budget.
typedef struct {
  const char *device_name;
  unsigned steps_total;
  unsigned steps_completed;
  unsigned retries_used;
} cw_matter_session_t;

void cw_matter_session_init(cw_matter_session_t *session, const char *device_name);

// Runs commissioning. Returns CW_OK when every step is delivered within its retry budget,
// or CW_ERR_IO when a step exhausts its retries (the transport is too lossy).
cw_status_t cw_matter_commission(cw_matter_session_t *session, cw_sim_transport_t *transport,
                                 unsigned max_retries_per_step);

#endif  // CHIPWRIGHT_PROTOCOL_H
