#include "openhome/sdk.h"

#include "openhome/hal.h"

#include <stdio.h>

// Parses one inbound command line and applies it to the device. The wire format mirrors the
// telemetry stream so a single serial console carries both directions: telemetry flows out as
// "telemetry metric=<key> value=<v> unit=<u>", commands flow in as "command key=<key>
// mode=<int>". A recognized command drives the actuator through the HAL and, on success, emits
// "actuator key=<key> mode=<int>" so the sender can confirm the applied state rather than
// assuming it. This is the path that turns actuator control into a real, observable operation
// on hardware and lets the HIL acceptance backend drive and verify actuators.
oh_status_t oh_command_apply(const char *line) {
  if (line == NULL) {
    return OH_ERR_INVALID;
  }
  char key[64];
  int mode = 0;
  if (sscanf(line, "command key=%63s mode=%d", key, &mode) != 2) {
    return OH_ERR_INVALID;
  }
  const oh_status_t status = oh_hal_set_actuator_mode(key, mode);
  if (status == OH_OK) {
    fprintf(stdout, "actuator key=%s mode=%d\n", key, mode);
    fflush(stdout);
  }
  return status;
}
