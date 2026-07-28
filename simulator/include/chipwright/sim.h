#ifndef CHIPWRIGHT_SIM_H
#define CHIPWRIGHT_SIM_H

#include <stdbool.h>

#include "chipwright/hal.h"
#include "chipwright/protocol.h"
#include "chipwright/sdk.h"

// Digital-twin simulator. It runs the same SDK and HAL as physical firmware, driving a
// simulated signal source instead of a chip and interposing a fault model at the HAL
// seam so scenarios such as sensor failure, stuck readings, and calibration drift can
// be exercised without hardware.

// A simulated scalar signal that advances by a fixed step on each read. This stands in
// for the real-world quantity a physical sensor would measure.
typedef struct {
  float value;
  float step;
} cw_sim_source_t;

void cw_sim_source_init(cw_sim_source_t *source, float initial, float step);
cw_sensor_driver_t cw_sim_source_driver(cw_sim_source_t *source);

// A bounded simulated signal for the live twin. Unlike cw_sim_source (a deterministic ramp the
// acceptance tests rely on), this stays within [min, max]: it wanders with a little noise and
// eases toward a target the twin can move, so an actuator can drive the quantity up or down
// (e.g. heating raises a temperature) without the reading ever leaving its declared range.
typedef struct {
  float min;
  float max;
  float value;
  float target;
  unsigned rng;
} cw_sim_signal_t;

void cw_sim_signal_init(cw_sim_signal_t *signal, float min, float max);
// Moves the resting point the signal eases toward; clamped into [min, max].
void cw_sim_signal_set_target(cw_sim_signal_t *signal, float target);
cw_sensor_driver_t cw_sim_signal_driver(cw_sim_signal_t *signal);

// A simulated actuator that records the last mode applied and logs each change. It lets a
// manifest's actuators be registered on the twin, with no hardware behind them, so a device
// with actuators runs on the twin exactly as one with only sensors.
typedef struct {
  const char *key;
  int mode;
} cw_sim_actuator_t;

void cw_sim_actuator_init(cw_sim_actuator_t *actuator, const char *key);
cw_actuator_driver_t cw_sim_actuator_driver(cw_sim_actuator_t *actuator);

// Fault models applied on top of an inner sensor driver.
typedef enum {
  CW_FAULT_NONE = 0,   // pass the inner reading through unchanged
  CW_FAULT_STUCK = 1,  // freeze the last good reading
  CW_FAULT_FAIL = 2,   // report an I/O failure
  CW_FAULT_OFFSET = 3, // add a constant offset, modelling calibration drift
} cw_fault_kind_t;

typedef struct {
  cw_fault_kind_t kind;
  float offset;
} cw_fault_config_t;

// Wraps an inner sensor driver with a configurable fault. The fault can be changed at
// any time to inject a fault mid-run.
typedef struct {
  cw_sensor_driver_t inner;
  cw_fault_config_t fault;
  float last_value;
  bool has_last;
} cw_fault_sensor_t;

void cw_fault_sensor_init(cw_fault_sensor_t *sensor, cw_sensor_driver_t inner);
void cw_fault_sensor_set(cw_fault_sensor_t *sensor, cw_fault_config_t fault);
cw_sensor_driver_t cw_fault_sensor_driver(cw_fault_sensor_t *sensor);

// Captures telemetry samples emitted while the twin runs, for observation and
// assertion. Sample metric and unit strings are borrowed and must outlive the capture.
#define CW_TWIN_MAX_SAMPLES 256

typedef struct {
  cw_telemetry_sample_t samples[CW_TWIN_MAX_SAMPLES];
  unsigned count;
  bool overflow;
} cw_twin_capture_t;

void cw_twin_capture_reset(cw_twin_capture_t *capture);

// Runs the device for `ticks` sampling cycles, capturing every telemetry sample. The
// previous telemetry sink is restored before returning.
cw_status_t cw_twin_run(const cw_device_t *device, unsigned ticks, cw_twin_capture_t *capture);

// Network conditions for the twin. Wraps the protocol layer's simulated transport so
// packet loss can be injected into commissioning and telemetry uplink, alongside the
// sensor fault model.
typedef struct {
  cw_sim_transport_t transport;
  unsigned telemetry_uplinked;
  unsigned telemetry_dropped;
} cw_twin_network_t;

void cw_twin_network_init(cw_twin_network_t *network, unsigned loss_percent, unsigned seed);

// Commissions the device over the twin's lossy network. Returns CW_OK when it survives
// the packet loss within the per-step retry budget.
cw_status_t cw_twin_commission(cw_twin_network_t *network, const char *device_name,
                               unsigned max_retries_per_step, cw_matter_session_t *out_session);

// Runs the device for `ticks`, capturing telemetry locally and attempting to uplink each
// sample over the lossy network. Dropped uplinks are counted in the network stats. The
// previous telemetry sink is restored before returning.
cw_status_t cw_twin_run_networked(const cw_device_t *device, unsigned ticks,
                                  cw_twin_capture_t *capture, cw_twin_network_t *network);

#endif  // CHIPWRIGHT_SIM_H
