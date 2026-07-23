#include "openhome/protocol.h"

// Linear congruential generator, kept local so packet-loss decisions are reproducible
// from a seed. The constants are the common glibc values.
static unsigned rng_next(oh_sim_transport_t *transport) {
  transport->rng_state = transport->rng_state * 1103515245u + 12345u;
  return (transport->rng_state >> 16) & 0x7fffu;
}

void oh_sim_transport_init(oh_sim_transport_t *transport, unsigned loss_percent, unsigned seed) {
  transport->loss_percent = loss_percent > 100u ? 100u : loss_percent;
  transport->rng_state = seed;
  transport->sent = 0;
  transport->dropped = 0;
}

bool oh_sim_transport_send(oh_sim_transport_t *transport, const void *payload, unsigned length) {
  (void)payload;
  (void)length;
  transport->sent++;
  if (transport->loss_percent > 0u && (rng_next(transport) % 100u) < transport->loss_percent) {
    transport->dropped++;
    return false;
  }
  return true;
}
