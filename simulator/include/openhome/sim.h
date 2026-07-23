#ifndef OPENHOME_SIM_H
#define OPENHOME_SIM_H

#include <stdbool.h>

#include "openhome/hal.h"
#include "openhome/protocol.h"
#include "openhome/sdk.h"

// Digital-twin simulator. It runs the same SDK and HAL as physical firmware, driving a
// simulated signal source instead of a chip and interposing a fault model at the HAL
// seam so scenarios such as sensor failure, stuck readings, and calibration drift can
// be exercised without hardware.

// A simulated scalar signal that advances by a fixed step on each read. This stands in
// for the real-world quantity a physical sensor would measure.
typedef struct {
  float value;
  float step;
} oh_sim_source_t;

void oh_sim_source_init(oh_sim_source_t *source, float initial, float step);
oh_sensor_driver_t oh_sim_source_driver(oh_sim_source_t *source);

// Fault models applied on top of an inner sensor driver.
typedef enum {
  OH_FAULT_NONE = 0,   // pass the inner reading through unchanged
  OH_FAULT_STUCK = 1,  // freeze the last good reading
  OH_FAULT_FAIL = 2,   // report an I/O failure
  OH_FAULT_OFFSET = 3, // add a constant offset, modelling calibration drift
} oh_fault_kind_t;

typedef struct {
  oh_fault_kind_t kind;
  float offset;
} oh_fault_config_t;

// Wraps an inner sensor driver with a configurable fault. The fault can be changed at
// any time to inject a fault mid-run.
typedef struct {
  oh_sensor_driver_t inner;
  oh_fault_config_t fault;
  float last_value;
  bool has_last;
} oh_fault_sensor_t;

void oh_fault_sensor_init(oh_fault_sensor_t *sensor, oh_sensor_driver_t inner);
void oh_fault_sensor_set(oh_fault_sensor_t *sensor, oh_fault_config_t fault);
oh_sensor_driver_t oh_fault_sensor_driver(oh_fault_sensor_t *sensor);

// Captures telemetry samples emitted while the twin runs, for observation and
// assertion. Sample metric and unit strings are borrowed and must outlive the capture.
#define OH_TWIN_MAX_SAMPLES 256

typedef struct {
  oh_telemetry_sample_t samples[OH_TWIN_MAX_SAMPLES];
  unsigned count;
  bool overflow;
} oh_twin_capture_t;

void oh_twin_capture_reset(oh_twin_capture_t *capture);

// Runs the device for `ticks` sampling cycles, capturing every telemetry sample. The
// previous telemetry sink is restored before returning.
oh_status_t oh_twin_run(const oh_device_t *device, unsigned ticks, oh_twin_capture_t *capture);

// Network conditions for the twin. Wraps the protocol layer's simulated transport so
// packet loss can be injected into commissioning and telemetry uplink, alongside the
// sensor fault model.
typedef struct {
  oh_sim_transport_t transport;
  unsigned telemetry_uplinked;
  unsigned telemetry_dropped;
} oh_twin_network_t;

void oh_twin_network_init(oh_twin_network_t *network, unsigned loss_percent, unsigned seed);

// Commissions the device over the twin's lossy network. Returns OH_OK when it survives
// the packet loss within the per-step retry budget.
oh_status_t oh_twin_commission(oh_twin_network_t *network, const char *device_name,
                               unsigned max_retries_per_step, oh_matter_session_t *out_session);

// Runs the device for `ticks`, capturing telemetry locally and attempting to uplink each
// sample over the lossy network. Dropped uplinks are counted in the network stats. The
// previous telemetry sink is restored before returning.
oh_status_t oh_twin_run_networked(const oh_device_t *device, unsigned ticks,
                                  oh_twin_capture_t *capture, oh_twin_network_t *network);

#endif  // OPENHOME_SIM_H
