// Shared fixtures for the marketplace tests: a valid device manifest and a helper that
// builds a well-formed package around it, so each test states only what it varies.

import { metaFromManifest, type DevicePackage, type PackageMeta } from "../src/package.js";

export const MANIFEST = `device:
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
  hvac:
    type: actuator
    modes:
      - heating
      - cooling
      - off

connectivity:
  protocols:
    - matter
    - thread

power:
  battery:
    rechargeable: true

security:
  encryption:
    enabled: true
`;

export function samplePackage(overrides: Partial<PackageMeta> = {}): DevicePackage {
  const meta = metaFromManifest(MANIFEST, {
    name: "example.thermostat",
    version: "1.0.0",
    description: "A reference smart thermostat",
    author: "example",
    license: "MIT",
    keywords: ["thermostat", "hvac"],
    ...overrides,
  });
  return {
    meta,
    files: {
      "device.yaml": MANIFEST,
      "README.md": "# Example Thermostat\n",
    },
  };
}
