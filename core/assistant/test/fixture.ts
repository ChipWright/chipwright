// Shared fixtures for the assistant tests: a valid manifest the grounding tools accept and
// an invalid one they reject.

export const VALID_MANIFEST = `device:
  name: smart_thermostat
  manufacturer: example
  category: thermostat

capabilities:
  temperature_sensor:
    type: sensor
    unit: celsius
    range:
      min: -20
      max: 50

connectivity:
  protocols:
    - matter

security:
  encryption:
    enabled: true
`;

// Missing the required device.category, so validation fails.
export const INVALID_MANIFEST = `device:
  name: broken_device
  manufacturer: example
`;
